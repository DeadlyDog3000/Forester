// ===========================================================================
//  FORESTER: RECKONING — Copyright (c) 2026 Roan Fraese / DeadlyDog Productions
// ===========================================================================

// THE MUSIC. A handful of players, as a German town of 1683 would know them — a lute, a recorder, a fiddle, a
// drone, a frame drum — made the way the rest of the game's sound is made, in code and not from recordings: the
// lute and the harp as a plucked string (Karplus and Strong's way: a burst of noise travelling round a loop that
// loses a little of its brightness each time), the recorder as a breathed tone with its chiff and vibrato, the
// fiddle and the drone as a bowed string coloured by the resonances of a fiddle's body. Each note is worked out
// once, the first time it's wanted, and kept.
//
// What they play is written below: short tunes in the old modes, each a melody over a chord to the bar, in two
// strains played AABB. The players arrange it themselves — who takes the tune each time round, whether the lute
// picks out the chords or strums them, whether the drum comes in — so a tune is never quite the same twice. Then,
// out in the settlement, a rest: the woods are quiet a while before the next one.

const SR = 24000;                                   // (the notes are made at a modest rate: plenty for these players)
const hz = m => 440 * Math.pow(2, (m - 69) / 12);
const TAU = Math.PI * 2;
const rand = (a, b) => a + Math.random() * (b - a);

// ---------------------------------------------------------------------------
//  the players
// ---------------------------------------------------------------------------
function normalize(d, peak = 0.9) {
  let m = 0; for (let i = 0; i < d.length; i++) m = Math.max(m, Math.abs(d[i]));
  if (m > 0) { const k = peak / m; for (let i = 0; i < d.length; i++) d[i] *= k; }
  const f = Math.min(d.length, Math.floor(SR * 0.006));      // (no click at the end)
  for (let i = 0; i < f; i++) d[d.length - 1 - i] *= i / f;
}
// a plucked string: the lute (brighter, shorter) and the harp (rounder, rings on)
function pluck(ac, midi, { t60 = 2.2, bright = 0.55, len = 3, body = 0 } = {}) {
  const f = hz(midi), n = Math.floor(SR * len), buf = ac.createBuffer(1, n, SR), out = buf.getChannelData(0);
  const P = SR / f - 0.5, N = Math.max(2, Math.floor(P)), frac = P - N, C = (1 - frac) / (1 + frac);
  const d = new Float32Array(N);
  // the pluck itself: a burst of noise, softened for a darker string, its middle lifted like a plucked shape
  let lp = 0; for (let i = 0; i < N; i++) { const w = Math.random() * 2 - 1; lp += (w - lp) * (0.2 + bright * 0.75); d[i] = lp * (0.6 + 0.4 * Math.sin(Math.PI * i / N)); }
  let mean = 0; for (let i = 0; i < N; i++) mean += d[i]; mean /= N; for (let i = 0; i < N; i++) d[i] -= mean;
  const rho = Math.pow(10, -3 / (f * t60));
  let idx = 0, prev = 0, apx = 0, apy = 0, bz = 0;
  for (let i = 0; i < n; i++) {
    const cur = d[idx];
    const avg = rho * 0.5 * (cur + prev); prev = cur;
    const y = C * avg + apx - C * apy; apx = avg; apy = y;     // (the fraction of a sample the loop's length needs)
    d[idx] = y; if (++idx >= N) idx = 0;
    // the body's warmth under the string: a little of the note, low and soft, as the soundboard gives it back
    bz += (cur - bz) * 0.06;
    out[i] = cur + bz * body;
  }
  normalize(out, 0.9);
  return buf;
}
// a recorder: a breathed tone, mostly the fundamental, a chiff of air as it speaks and a little vibrato as it holds
function blown(ac, midi, len) {
  const f = hz(midi), n = Math.floor(SR * len), buf = ac.createBuffer(1, n, SR), o = buf.getChannelData(0);
  let ph = 0, nz = 0, nz2 = 0;
  const vr = rand(4.8, 5.6), vp = Math.random() * TAU;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const vib = 1 + 0.0032 * Math.sin(TAU * vr * t + vp) * Math.min(1, Math.max(0, (t - 0.3) / 0.5));
    const scoop = 1 - 0.012 * Math.exp(-t / 0.025);
    ph += TAU * f * vib * scoop / SR;
    const s = Math.sin(ph) + 0.15 * Math.sin(2 * ph + 0.3) + 0.08 * Math.sin(3 * ph + 0.7) + 0.03 * Math.sin(4 * ph + 1.1);
    const w = Math.random() * 2 - 1; nz += (w - nz) * 0.35; nz2 += (nz - nz2) * 0.35;
    const chiff = Math.exp(-t / 0.016);
    const env = Math.min(1, t / 0.03) * (0.94 + 0.06 * Math.sin(TAU * 0.6 * t + 1));
    o[i] = env * (s * 0.82 + (nz - nz2) * 0.12) + chiff * w * 0.1;
  }
  normalize(o, 0.85);
  return buf;
}
// a bowed string: one cycle of the wave worked out from its harmonics, each made louder or softer by a fiddle's
// body (the air's resonance, the wood's, the bridge's), then drawn out with a bow's attack, vibrato and hiss
function bodyGain(fr, dark) {
  let g = 0.2;
  for (const [c, w, a] of [[290, 0.25, 1], [470, 0.22, 0.8], [1050, 0.3, 0.55], [2600, 0.35, 0.6 * dark], [4200, 0.4, 0.25 * dark]]) g += a * Math.exp(-Math.pow(Math.log(fr / c) / w, 2));
  return g;
}
const tables = new Map();
function wavetable(midi, dark) {
  const key = midi + "|" + dark; if (tables.has(key)) return tables.get(key);
  const f = hz(midi), L = 2048, T = new Float32Array(L), K = Math.max(1, Math.floor(8500 / f));
  for (let k = 1; k <= K; k++) {
    const a = bodyGain(k * f, dark) / k, p = Math.random() * TAU;
    for (let j = 0; j < L; j++) T[j] += a * Math.sin(TAU * k * j / L + p);
  }
  let m = 0; for (const v of T) m = Math.max(m, Math.abs(v)); for (let j = 0; j < L; j++) T[j] /= m || 1;
  tables.set(key, T); return T;
}
function bowed(ac, midi, len, { vib = 0.005, attack = 0.08, dark = 1, hiss = 0.04 } = {}) {
  const f = hz(midi), n = Math.floor(SR * len), buf = ac.createBuffer(1, n, SR), o = buf.getChannelData(0), T = wavetable(midi, dark), L = T.length;
  let ph = Math.random() * L, nz = 0;
  const vr = rand(5, 6), vp = Math.random() * TAU;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const v = 1 + vib * Math.sin(TAU * vr * t + vp) * Math.min(1, Math.max(0, (t - 0.12) / 0.3));
    ph += f * v * L / SR; if (ph >= L) ph -= L;
    const j = Math.floor(ph), fr = ph - j, s = T[j] + (T[(j + 1) % L] - T[j]) * fr;
    const w = Math.random() * 2 - 1; nz += (w - nz) * 0.5;
    const env = Math.min(1, t / attack) * (0.9 + 0.1 * Math.sin(TAU * 0.45 * t));
    o[i] = env * (s + nz * hiss * (1.5 - Math.min(1, t / 0.2)));
  }
  normalize(o, 0.85);
  return buf;
}
// the frame drum: a skin's thump, its pitch falling as it sounds, and the slap of the hand; or a tap at the rim
function drum(ac, kind) {
  const len = kind === "low" ? 0.8 : 0.35, n = Math.floor(SR * len), buf = ac.createBuffer(1, n, SR), o = buf.getChannelData(0);
  let ph = 0, nz = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR, w = Math.random() * 2 - 1;
    if (kind === "low") {
      ph += TAU * (62 + 70 * Math.exp(-t / 0.035)) / SR;
      nz += (w - nz) * 0.25;
      o[i] = Math.sin(ph) * Math.exp(-t / 0.32) + nz * Math.exp(-t / 0.018) * 0.5;
    } else {
      ph += TAU * (210 + 90 * Math.exp(-t / 0.015)) / SR;
      nz += (w - nz) * 0.7;
      o[i] = Math.sin(ph) * Math.exp(-t / 0.07) * 0.5 + (w - nz) * Math.exp(-t / 0.012) * 0.9;
    }
  }
  normalize(o, 0.9);
  return buf;
}

// each note, made once (the oldest let go when there are many)
const cache = new Map();
const INST = {
  lute:     { pan: -0.28, kind: "pluck", make: (ac, m) => pluck(ac, m, { t60: 1.6 + 40 / hz(m), bright: 0.6, len: 2.6, body: 0.35 }) },
  harp:     { pan: 0.22, kind: "pluck", make: (ac, m) => pluck(ac, m, { t60: 2.6 + 60 / hz(m), bright: 0.4, len: 3.8, body: 0.2 }) },
  recorder: { pan: 0.08, kind: "held", make: (ac, m, len) => blown(ac, m, len) },
  fiddle:   { pan: 0.12, kind: "held", make: (ac, m, len) => bowed(ac, m, len, { vib: 0.006, attack: 0.07, dark: 1 }) },
  viol:     { pan: 0.2, kind: "held", make: (ac, m, len) => bowed(ac, m, len, { vib: 0.003, attack: 0.15, dark: 0.55, hiss: 0.03 }) },
  drone:    { pan: 0.0, kind: "held", make: (ac, m, len) => bowed(ac, m, len, { vib: 0.0015, attack: 0.6, dark: 0.35, hiss: 0.015 }) },
  drum:     { pan: 0.18, kind: "hit", make: (ac, m) => drum(ac, m === 1 ? "low" : "high") },
};
function bufFor(ac, inst, midi, dur) {
  const I = INST[inst];
  const len = I.kind === "held" ? Math.min(14, Math.ceil(dur + 0.35)) : 0;
  const key = inst + "|" + midi + "|" + len;
  let b = cache.get(key);
  if (b) { cache.delete(key); cache.set(key, b); return b; }
  b = I.make(ac, midi, len); cache.set(key, b);
  if (cache.size > 160) cache.delete(cache.keys().next().value);
  return b;
}

// ---------------------------------------------------------------------------
//  the tunes
// ---------------------------------------------------------------------------
// A melody is written in degrees of its mode — 1 the keynote, 8 the keynote an octave up, 0 the note below it —
// each with its length in beats ("5:1.5"), "r" a rest, "#"/"b" a note raised or lowered; bars are marked "|" to
// read by. The chords are a degree to the bar, or two to a bar ("4/5"), each built in thirds within the mode.
const MODES = { ionian: [0, 2, 4, 5, 7, 9, 11], dorian: [0, 2, 3, 5, 7, 9, 10], phrygian: [0, 1, 3, 5, 7, 8, 10], mixolydian: [0, 2, 4, 5, 7, 9, 10], aeolian: [0, 2, 3, 5, 7, 8, 10] };
export function degree(root, mode, d, acc = 0) { const sc = MODES[mode], k = d - 1, o = Math.floor(k / 7), i = ((k % 7) + 7) % 7; return root + o * 12 + sc[i] + acc; }
export function parseMelody(s) {
  const notes = []; let t = 0;
  for (const tok of s.replace(/\|/g, " ").trim().split(/\s+/)) {
    const [n, b] = tok.split(":"), beats = +b;
    if (n !== "r") { const m = n.match(/^(-?\d+)([#b]?)$/); notes.push({ t, d: +m[1], acc: m[2] === "#" ? 1 : m[2] === "b" ? -1 : 0, beats }); }
    t += beats;
  }
  return { notes, len: t };
}
export const parseChords = s => s.trim().split(/\s+/).map(tok => tok.split("/").map(Number));

export const PIECES = {
  // the title: "Ashes", a slow air
  ashes: { bpm: 70, beats: 3, root: 62, mode: "dorian", style: "air", lead: ["recorder", "fiddle"],
    A: "5:2 4:1 | 3:2 1:1 | 2:1.5 3:0.5 4:1 | 5:3 | 6:2 5:1 | 4:2 3:1 | 2:1 1:1 2:1 | 1:3", cA: "1 1 7 1 4 7 5 1",
    B: "8:2 7:1 | 8:1 5:2 | 6:1 7:1 8:1 | 5:3 | 4:2 5:1 | 6:1.5 5:0.5 4:1 | 3:1 2:1 3:1 | 1:3", cB: "1 1 4 3 7 4 5 1" },
  // the title, and the house by the harbour
  harbour: { bpm: 62, beats: 4, root: 69, mode: "aeolian", style: "air", lead: ["recorder", "harp"],
    A: "1:1 3:1 5:1.5 4:0.5 | 3:1 2:1 1:2 | 3:1 5:1 8:1.5 7:0.5 | 6:3 5:1 | 4:1 5:1 6:1 4:1 | 3:1 4:1 5:2 | 6:1 5:1 4:1 2:1 | 1:4", cA: "1 1/5 3 6 4 1 4/5 1",
    B: "5:1 8:1 8:1 7:1 | 6:1 7:0.5 8:0.5 5:2 | 4:1 6:1 5:1 4:1 | 3:2 r:1 5:1 | 8:1.5 7:0.5 6:1 5:1 | 4:1 3:1 2:2 | 3:1 4:1 2:1.5 1:0.5 | 1:4", cB: "1 6/3 4 1 6 4/7 4/5 1" },
  // home in Hamburg: a jig
  merchant: { bpm: 200, beats: 6, root: 67, mode: "ionian", style: "jig", lead: ["recorder", "fiddle"],
    A: "1:2 3:1 5:2 3:1 | 4:2 6:1 5:3 | 8:2 7:1 6:2 5:1 | 4:1 5:1 4:1 3:3 | 1:2 3:1 5:2 8:1 | 7:2 6:1 5:3 | 6:1 5:1 4:1 3:2 2:1 | 1:6", cA: "1 4/5 1/5 4/1 1 5 4/5 1",
    B: "5:2 6:1 7:2 8:1 | 9:2 8:1 7:3 | 8:2 6:1 5:2 3:1 | 4:2 2:1 5:3 | 5:2 6:1 7:2 8:1 | 9:2 10:1 8:3 | 7:1 8:1 9:1 5:2 7:1 | 8:6", cB: "1/5 5 4/1 4/5 1/5 5/1 5 1" },
  // a minuet, as the burghers dance
  burgher: { bpm: 100, beats: 3, root: 72, mode: "ionian", style: "dance", lead: ["recorder", "fiddle"],
    A: "1:1 3:1 5:1 | 8:2 7:1 | 6:1 5:1 4:1 | 3:3 | 4:1 6:1 5:1 | 3:2 1:1 | 2:1 3:1 2:1 | 2:3", cA: "1 1 4 1 4 1 5 5",
    B: "5:1 6:1 7:1 | 8:2 5:1 | 6:1 7:1 8:1 | 9:3 | 8:1 7:1 6:1 | 5:1 4:1 3:1 | 2:1 4:1 0:1 | 1:3", cB: "1 1 4 5 6 1 5 1" },
  // the old woods
  clearing: { bpm: 84, beats: 3, root: 64, mode: "dorian", style: "air", lead: ["lute", "recorder"],
    A: "1:1 2:1 3:1 | 5:2 4:1 | 3:1 2:1 1:1 | 2:3 | 3:1 4:1 5:1 | 6:2 5:1 | 4:1 3:1 2:1 | 1:3", cA: "1 1 1 7 1 4 7 1",
    B: "8:2 7:1 | 6:1 5:1 4:1 | 5:2 3:1 | 4:3 | 3:1 5:1 8:1 | 7:2 6:1 | 5:1.5 4:0.5 2:1 | 1:3", cB: "1 4 1 7 1 7 5 1" },
  morning: { bpm: 66, beats: 4, root: 62, mode: "mixolydian", style: "air", lead: ["harp", "recorder"],
    A: "5:2 6:1 5:1 | 4:1 3:1 2:2 | 1:1 2:1 3:1 4:1 | 5:4 | 8:2 7:1 6:1 | 5:1 4:1 3:2 | 2:1 3:1 2:1 0:1 | 1:4", cA: "1 7 1 1 4 1 7 1",
    B: "3:1 5:1 8:2 | 7:1 6:1 5:2 | 6:1 5:1 4:1 6:1 | 5:4 | 4:2 5:1 6:1 | 7:1 6:1 5:2 | 4:1 3:1 2:1 3:1 | 1:4", cB: "1 7/1 4 1 4 7/1 7 1" },
  // the settlement at work: a brisk dance with the drum
  workday: { bpm: 112, beats: 4, root: 74, mode: "ionian", style: "dance", lead: ["recorder", "fiddle"],
    A: "1:1 1:0.5 2:0.5 3:1 1:1 | 5:1 4:0.5 3:0.5 2:1 5:1 | 3:1 3:0.5 4:0.5 5:1 3:1 | 2:1 1:1 2:2 | 1:1 1:0.5 2:0.5 3:1 1:1 | 4:1 5:0.5 6:0.5 5:1 3:1 | 2:1 3:0.5 2:0.5 1:1 0:1 | 1:4", cA: "1 5 1 5 1 4/1 5 1",
    B: "5:1 6:0.5 7:0.5 8:1 5:1 | 6:1 5:1 4:2 | 5:1 6:0.5 7:0.5 8:1 6:1 | 5:1 4:1 3:2 | 3:1 4:0.5 5:0.5 6:1 4:1 | 5:1 4:1 3:1 1:1 | 2:1 3:0.5 2:0.5 1:1 0:1 | 1:4", cB: "1 4 1/4 1 4 1 5 1" },
  // evening by the fire
  firelight: { bpm: 150, beats: 6, root: 67, mode: "dorian", style: "air", lead: ["fiddle", "recorder"],
    A: "5:3 4:2 3:1 | 2:2 1:1 2:3 | 3:2 4:1 5:2 7:1 | 8:6 | 7:2 6:1 5:2 4:1 | 3:2 5:1 4:3 | 3:2 2:1 1:2 0:1 | 1:6", cA: "1 7 1 1 7/4 3/4 7 1",
    B: "8:3 9:2 8:1 | 7:2 6:1 5:3 | 6:2 7:1 8:2 6:1 | 5:6 | 4:2 5:1 6:2 4:1 | 5:2 3:1 1:3 | 2:2 3:1 4:2 2:1 | 1:6", cB: "1 7 4 1 7 1 7 1" },
  // the dark, and the stars
  nightfall: { bpm: 54, beats: 3, root: 71, mode: "aeolian", style: "sparse", lead: ["harp", "harp"],
    A: "5:3 | 3:2 4:1 | 5:2 6:1 | 5:3 | 8:3 | 7:2 6:1 | 5:1 4:1 3:1 | 2:3", cA: "1 1 6 1 1 6 3 5",
    B: "1:3 | 3:2 2:1 | 1:2 0:1 | 1:3 | 6:3 | 5:2 4:1 | 3:1 2:1 0:1 | 1:3", cB: "1 5 1/7 1 6 4 5 1" },
  // winter
  frost: { bpm: 56, beats: 4, root: 64, mode: "aeolian", style: "sparse", lead: ["lute", "harp"],
    A: "1:2 2:1 3:1 | 5:3 4:1 | 3:2 2:1 1:1 | 0:4 | 1:2 3:1 5:1 | 6:3 5:1 | 4:1 3:1 2:2 | 1:4", cA: "1 3 1 7 1 6 4/5 1",
    B: "3:2 4:1 5:1 | 6:2 5:2 | 4:2 3:1 2:1 | 3:4 | 5:2 4:1 3:1 | 2:3 3:1 | 2:1 1:1 0:1 2:1 | 1:4", cB: "3 6 4/7 3 1 7 5/7 1" },
  // grief
  lament: { bpm: 58, beats: 3, root: 62, mode: "aeolian", style: "air", lead: ["viol", "fiddle"],
    A: "5:2 6:1 | 5:1 4:1 3:1 | 4:2 2:1 | 1:3 | 3:2 4:1 | 5:1 6:1 7:1 | 6:2 5:1 | 5:3", cA: "1 1 7 1 3 3 6 5",
    B: "8:2 7:1 | 6:2 5:1 | 4:1 5:1 6:1 | 5:3 | 3:2 4:1 | 5:1 4:1 3:1 | 2:2 0:1 | 1:3", cB: "1 6 4 1 3 1 7 1" },
  // unease
  shadows: { bpm: 52, beats: 4, root: 57, mode: "aeolian", style: "sparse", lead: ["harp", "viol"],
    A: "5:3 r:1 | 6:2 5:2 | 4:4 | r:4 | 3:3 r:1 | 4:2 3:2 | 2:4 | r:4", cA: "1 6 4 4 1 6 5 5",
    B: "8:3 r:1 | 7:2 6:2 | 5:4 | r:4 | 6:3 r:1 | 5:2 4:2 | 2:4 | 1:4", cB: "1 7 1 1 6 4 5 1" },
  // dread: a drone, and a low line moving over it
  dread: { bpm: 48, beats: 4, root: 48, mode: "phrygian", style: "drone", lead: ["viol", "viol"],
    A: "1:4 | 2:4 | 1:3 r:1 | 0:4 | 1:2 2:2 | 3:4 | 2:2 1:2 | 1:4", cA: "1 1 1 1 1 1 1 1",
    B: "5:4 | 6:2 5:2 | 4:4 | 2:4 | 3:2 2:2 | 1:4 | 2:2 0:2 | 1:4", cB: "1 1 1 1 1 1 1 1" },
  // running for your life
  flight: { bpm: 132, beats: 4, root: 69, mode: "aeolian", style: "battle", lead: ["fiddle", "fiddle"],
    A: "1:0.5 1:0.5 5:1 4:0.5 3:0.5 2:1 | 1:0.5 2:0.5 3:1 0:2 | 1:0.5 1:0.5 5:1 6:0.5 5:0.5 4:1 | 3:1 2:1 1:2", cA: "1 1/7 1 5/1",
    B: "6:0.5 6:0.5 5:1 4:0.5 3:0.5 4:1 | 5:1 3:1 1:2 | 6:0.5 6:0.5 5:1 4:0.5 3:0.5 2:1 | 1:1 0:1 1:2", cB: "4 1 4 7/1" },
  // raiders in the settlement
  onslaught: { bpm: 118, beats: 4, root: 62, mode: "aeolian", style: "battle", lead: ["fiddle", "viol"],
    A: "1:1 1:0.5 1:0.5 3:1 1:1 | 0:1 0:0.5 0:0.5 2:1 0:1 | 1:1 1:0.5 1:0.5 3:1 5:1 | 4:1 3:1 2:1 0:1", cA: "1 7 1 4/7",
    B: "5:1 5:0.5 5:0.5 6:1 5:1 | 4:1 4:0.5 4:0.5 3:1 2:1 | 3:1 3:0.5 3:0.5 4:1 3:1 | 2:1 1:1 0:1 1:1", cB: "1 7 3 7/1" },
  // hope
  hope: { bpm: 92, beats: 4, root: 65, mode: "ionian", style: "air", lead: ["recorder", "fiddle"],
    A: "1:1 3:1 5:1 8:1 | 7:1 6:1 5:2 | 6:1 5:1 4:1 3:1 | 2:2 5:2 | 1:1 3:1 5:1 8:1 | 9:1 8:1 7:1 6:1 | 5:1 4:1 2:1 0:1 | 1:4", cA: "1 5 4 5 1 5 5 1",
    B: "5:2 6:1 7:1 | 8:2 5:2 | 6:1 7:1 8:1 6:1 | 5:4 | 4:1 5:1 6:1 4:1 | 3:1 4:1 5:2 | 6:1 5:1 4:1 2:1 | 1:4", cB: "1 1 4 1 4 1 4/5 1" },
  // a feast: a quick jig with the drum
  feast: { bpm: 250, beats: 6, root: 67, mode: "ionian", style: "jig", lead: ["recorder", "fiddle"],
    A: "1:1 2:1 3:1 5:2 3:1 | 4:1 5:1 6:1 5:3 | 8:1 7:1 6:1 5:1 4:1 3:1 | 2:1 3:1 2:1 5:3 | 1:1 2:1 3:1 5:2 3:1 | 4:1 5:1 6:1 8:3 | 7:1 6:1 5:1 4:1 3:1 2:1 | 1:3 1:3", cA: "1 4/1 1/4 5 1 4/1 5 1",
    B: "8:2 7:1 8:2 5:1 | 6:2 5:1 6:2 4:1 | 5:2 4:1 3:2 1:1 | 2:3 5:3 | 8:2 7:1 8:2 9:1 | 10:2 9:1 8:3 | 7:1 6:1 5:1 4:1 3:1 2:1 | 1:6", cB: "1 4 1 5 1 1 5 1" },
};

// the moods the game asks for, the tunes that suit each, and how long the quiet between them
export const MOODS = {
  title:      { pieces: ["ashes", "harbour"], rest: [1, 2.5] },
  // the multiplayer lobby and the character builder: music to wait to, one tune after another with hardly a breath
  lobby:      { pieces: ["feast", "merchant", "burgher", "workday", "hope", "harbour"], rest: [0.4, 1.2] },
  home:       { pieces: ["merchant", "burgher", "harbour"], rest: [6, 14] },
  unease:     { pieces: ["shadows"], rest: [2, 4] },
  dread:      { pieces: ["dread"], rest: [0.5, 1] },
  grief:      { pieces: ["lament", "nightfall"], rest: [4, 8] },
  flight:     { pieces: ["flight"], rest: [0, 0.2] },
  woods:      { pieces: ["clearing", "morning", "firelight", "frost"], rest: [25, 60] },
  hope:       { pieces: ["hope", "morning", "clearing"], rest: [10, 25] },
  settlement: { pieces: ["workday", "clearing", "morning", "hope", "burgher", "merchant"], rest: [40, 90] },
  evening:    { pieces: ["firelight", "harbour", "lament"], rest: [30, 70] },
  night:      { pieces: ["nightfall", "shadows", "frost"], rest: [45, 100] },
  winter:     { pieces: ["frost", "nightfall", "ashes"], rest: [40, 90] },
  battle:     { pieces: ["onslaught", "flight"], rest: [0, 0.3] },
  feast:      { pieces: ["feast", "merchant", "workday", "burgher"], rest: [3, 8] },
};

// ---------------------------------------------------------------------------
//  the arranging: a tune, played through once, as the notes each player plays and when
// ---------------------------------------------------------------------------
function arrange(p) {
  const ev = [];
  const A = parseMelody(p.A), B = parseMelody(p.B), cA = parseChords(p.cA), cB = parseChords(p.cB);
  const bar = p.beats, low = p.root - 24 + (p.root < 60 ? 12 : 0);
  const triad = (r, base) => [0, 2, 4].map(k => { let m = degree(base, p.mode, r + k); return m; });
  const lead = p.lead || ["recorder"];
  const drums = p.style === "dance" || p.style === "jig" || p.style === "battle";
  const form = Math.random() < 0.7 ? ["A", "A", "B", "B"] : ["A", "B", "A", "B"];
  let t0 = 0, pass = 0;
  const lastPass = form.length - 1;
  for (const s of form) {
    const mel = s === "A" ? A : B, ch = s === "A" ? cA : cB;
    // who has the tune this time round (the first time, the first of them; after, the others take turns)
    const who = lead[pass % lead.length];
    const leadInst = who;
    const sparseFirst = p.style === "sparse" && pass === 0;
    for (const n of mel.notes) {
      let m = degree(p.root, p.mode, n.d, n.acc);
      if (INST[leadInst].kind === "pluck" && m > 84) m -= 12;
      ev.push({ t: t0 + n.t, inst: leadInst, midi: m, dur: n.beats, vel: 0.5 + (n.t % bar === 0 ? 0.08 : 0) + (n.beats >= 2 ? 0.04 : 0), lead: true });
      // the second time through a strain, a second voice in thirds under the long notes
      if (pass >= 2 && n.beats >= 1.5 && p.style !== "drone" && p.style !== "battle" && Math.random() < 0.7) {
        const m2 = degree(p.root, p.mode, n.d - 2, n.acc);
        ev.push({ t: t0 + n.t + 0.02, inst: leadInst === "fiddle" ? "viol" : leadInst === "recorder" ? "harp" : "viol", midi: m2 - (leadInst === "recorder" ? 0 : 0), dur: n.beats, vel: 0.24 });
      }
    }
    // the accompaniment, bar by bar
    for (let b = 0; b < ch.length; b++) {
      const parts = ch[b], seg = bar / parts.length;
      for (let k = 0; k < parts.length; k++) {
        const r = parts[k], at = t0 + b * bar + k * seg, tones = triad(r, low + 12), bass = degree(low, p.mode, r);
        if (p.style === "drone") continue;
        if (sparseFirst && k > 0) continue;
        if (p.style === "air" || p.style === "sparse") {
          // the lute (or the harp) picks the chord out: the bass, then the chord's notes climbing
          const pl = p.style === "sparse" ? "harp" : "lute";
          ev.push({ t: at, inst: pl, midi: bass, dur: seg, vel: 0.34 });
          // (under a sparse tune, the chord's root held very softly, so the quiet between its notes isn't empty)
          if (p.style === "sparse") ev.push({ t: at, inst: "drone", midi: bass + 12, dur: seg + 0.5, vel: 0.13 });
          const steps = Math.max(1, Math.round(seg)) * (p.bpm < 70 && bar <= 4 ? 2 : 1), dt = seg / steps;
          for (let i = 1; i < steps; i++) {
            if (p.style === "sparse" && i % 2) continue;
            const tone = tones[(i - 1) % 3] + (i > 3 ? 12 : 0);
            ev.push({ t: at + i * dt, inst: pl, midi: tone, dur: dt * 1.8, vel: 0.2 + Math.random() * 0.05 });
          }
          if (pass >= 1 && p.style === "air" && Math.random() < 0.6) ev.push({ t: at, inst: "viol", midi: bass + 12, dur: seg * 0.98, vel: 0.12 });
        } else if (p.style === "dance" || p.style === "jig") {
          // bass on the beat, the chord strummed after it
          ev.push({ t: at, inst: "lute", midi: bass, dur: seg, vel: 0.36 });
          const beatsIn = p.style === "jig" ? [3] : bar === 3 ? [1, 2] : [1, 2, 3];
          for (const bi of beatsIn) {
            if (bi >= seg) continue;
            tones.forEach((tm, j) => ev.push({ t: at + bi + j * 0.03 * (p.bpm / 100), inst: "lute", midi: tm, dur: 1, vel: 0.17 }));
          }
        } else if (p.style === "battle") {
          // a driving low line under the tune
          for (let i = 0; i < seg; i += 0.5) ev.push({ t: at + i, inst: "viol", midi: bass, dur: 0.45, vel: i % 1 === 0 ? 0.3 : 0.2 });
        }
      }
      // the drum
      if (drums && !(pass === 0 && p.style !== "battle" && b < 2)) {
        const at = t0 + b * bar;
        const pat = p.style === "battle" ? [[0, 1], [1, 2], [1.5, 1], [2, 1], [3, 2], [3.5, 2]]
          : p.style === "jig" ? [[0, 1], [2, 2], [3, 1], [5, 2]]
          : bar === 3 ? [[0, 1], [1, 2], [2, 2]] : [[0, 1], [1, 2], [2, 1], [3, 2]];
        for (const [o, k] of pat) ev.push({ t: at + o, inst: "drum", midi: k, dur: 0.3, vel: k === 1 ? 0.42 : 0.24, hit: true });
      }
    }
    if (p.style === "drone") {
      // the drone: the keynote and its fifth, held the whole strain through, and a slow heartbeat on the drum
      const len = ch.length * bar;
      // (in lengths of two bars, each overlapping the next by a beat, so it never thins or breaks)
      for (let s0 = 0; s0 < len; s0 += bar * 2) {
        const d = Math.min(bar * 2 + 1, len - s0 + (s0 + bar * 2 < len ? 1 : 0));
        ev.push({ t: t0 + s0, inst: "drone", midi: low, dur: d, vel: 0.34 });
        ev.push({ t: t0 + s0 + 0.3, inst: "drone", midi: degree(low, p.mode, 5), dur: d - 0.3, vel: 0.2 });
      }
      for (let i = 0; i < len; i += bar) { ev.push({ t: t0 + i, inst: "drum", midi: 1, dur: 0.3, vel: 0.32, hit: true }); ev.push({ t: t0 + i + 0.45, inst: "drum", midi: 1, dur: 0.3, vel: 0.2, hit: true }); }
    }
    t0 += Math.max(mel.len, ch.length * bar);
    pass++;
  }
  // and the last chord, held
  const fin = parseChords(form[lastPass] === "A" ? p.cA : p.cB).slice(-1)[0].slice(-1)[0];
  if (p.style !== "drone") ev.push({ t: t0, inst: p.style === "battle" ? "viol" : "harp", midi: degree(low, p.mode, fin), dur: bar * 1.5, vel: 0.3 });
  return { ev: ev.sort((a, b) => a.t - b.t), beats: t0 + bar, bar };
}

// when each beat falls, in seconds: steady, but drawn out over the last two bars, as players slow to an end
function timing(p, total) {
  const spb = 60 / p.bpm, rit0 = total - p.beats * 2.5;
  return beat => {
    if (beat <= rit0) return beat * spb;
    const x = beat - rit0, L = total - rit0;
    return (rit0 + x + 0.45 * x * x * x / (3 * L * L)) * spb;     // (the integral of a slowing that grows as the square)
  };
}

// each player's own way into the mix: how loud, where they stand, the colour of their instrument
function makeBuses(ac, out) {
  const buses = {};
  return inst => {
    if (buses[inst]) return buses[inst];
    const g = ac.createGain(), pan = ac.createStereoPanner(); pan.pan.value = INST[inst].pan;
    g.gain.value = { lute: 0.9, harp: 0.8, recorder: 0.62, fiddle: 0.55, viol: 0.6, drone: 0.5, drum: 0.75 }[inst];
    let last = pan;
    // (the lute's body: warmth low down; the low strings bowed, their top taken off)
    if (inst === "lute") { const lo = ac.createBiquadFilter(); lo.type = "peaking"; lo.frequency.value = 210; lo.gain.value = 4; lo.Q.value = 1.2; pan.connect(lo); last = lo; }
    if (inst === "drone" || inst === "viol") { const lp = ac.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = inst === "drone" ? 1400 : 2600; pan.connect(lp); last = lp; }
    g.connect(pan); last.connect(out);
    return buses[inst] = g;
  };
}
// one note: its sound, how loud, and how it ends — a held note lets go at its end, a plucked one rings a little
// past it and is damped, a drum sounds out
function note(ac, e, ts, te, busOf) {
  const I = INST[e.inst];
  const src = ac.createBufferSource(); src.buffer = bufFor(ac, e.inst, e.midi, te - ts);
  const g = ac.createGain(), v = e.vel * (0.9 + Math.random() * 0.2), t = Math.max(ts, ac.currentTime);
  const rel = I.kind === "held" ? (e.inst === "drone" ? 1.5 : 0.12) : I.kind === "pluck" ? 0.35 : 0.05;
  const end = Math.max(t, I.kind === "pluck" ? Math.min(ts + src.buffer.duration - 0.05, te + (e.lead ? 0.25 : 0.6)) : I.kind === "hit" ? ts + src.buffer.duration : te);
  g.gain.setValueAtTime(v, t); g.gain.setValueAtTime(v, end); g.gain.linearRampToValueAtTime(0.0001, end + rel);
  src.connect(g); g.connect(busOf(e.inst));
  src.start(t); src.stop(end + rel + 0.05);
  return src;
}
// a tune played straight into a recording, start to finish (for listening to it outside the game)
export async function renderPiece(name, sampleRate = 44100) {
  const p = PIECES[name], { ev, beats } = arrange(p), at = timing(p, beats), secs = at(beats) + 3.5;
  const ac = new OfflineAudioContext(2, Math.ceil(secs * sampleRate), sampleRate);
  const master = ac.createGain(); master.gain.value = 0.55; master.connect(ac.destination);
  const out = ac.createGain(); out.connect(master);
  const cv = ac.createConvolver(); cv.buffer = roomIR(ac); const wet = ac.createGain(); wet.gain.value = 0.32; out.connect(cv); cv.connect(wet); wet.connect(master);
  const busOf = makeBuses(ac, out);
  for (const e of ev) note(ac, e, 0.2 + at(e.t) + (e.hit ? 0 : (Math.random() - 0.5) * 0.014), 0.2 + at(e.t + e.dur), busOf);
  return ac.startRendering();
}
function roomIR(ac) {
  // a room: noise, dying away over a couple of seconds, darker as it goes
  const len = Math.floor(ac.sampleRate * 2.6), ir = ac.createBuffer(2, len, ac.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = ir.getChannelData(c); let lp = 0;
    for (let i = 0; i < len; i++) {
      const t = i / ac.sampleRate, w = Math.random() * 2 - 1, k = 0.9 - 0.75 * Math.min(1, t / 2);
      lp += (w - lp) * k;
      d[i] = t < 0.012 ? 0 : lp * Math.exp(-t / 0.55) * 0.5;
    }
  }
  return ir;
}

// ---------------------------------------------------------------------------
//  the player: one tune at a time, a rest, the next
// ---------------------------------------------------------------------------
export function createMusic(getCtx, getOut) {
  let mood = null, cur = null, wait = null, lastPiece = null, verb = null;
  function reverb(ac) {
    if (verb) return verb;
    const cv = ac.createConvolver(); cv.buffer = roomIR(ac);
    const wet = ac.createGain(); wet.gain.value = 0.32; cv.connect(wet); wet.connect(getOut());
    return verb = cv;
  }
  function stopCurrent(fade = 2.5) {
    if (!cur) return;
    const ac = getCtx(), c = cur; cur = null;
    clearInterval(c.timer); c.stopped = true;
    if (ac) { c.out.gain.cancelScheduledValues(ac.currentTime); c.out.gain.setTargetAtTime(0, ac.currentTime, fade / 4); }
    setTimeout(() => { for (const s of c.live) { try { s.stop(); } catch (e) {} } try { c.out.disconnect(); } catch (e) {} }, (fade + 0.5) * 1000);
  }
  function pick(m) {
    const list = MOODS[m].pieces.filter(n => n !== lastPiece);
    return (list.length ? list : MOODS[m].pieces)[Math.floor(Math.random() * (list.length || MOODS[m].pieces.length))];
  }
  function start(m) {
    clearTimeout(wait);
    if (mood !== m) return;
    const ac = getCtx();
    if (!ac || !window.__reckonMusic) { wait = setTimeout(() => start(m), 4000); return; }
    const name = pick(m), p = PIECES[name]; lastPiece = name;
    const { ev, beats } = arrange(p), at = timing(p, beats);
    // every note it will want, made ahead in small handfuls between frames, so the game never stutters for it
    const want = ev.map(e => [e.inst, e.midi, (at(e.t + e.dur) - at(e.t))]);
    let i = 0;
    const prep = () => {
      if (mood !== m) return;
      const until = performance.now() + 6;
      while (i < want.length && performance.now() < until) { const [inst, midi, d] = want[i++]; bufFor(ac, inst, midi, d); }
      if (i < want.length) { wait = setTimeout(prep, 16); return; }
      play(ac, m, p, ev, at, beats);
    };
    prep();
  }
  function play(ac, m, p, ev, at, beats) {
    const out = ac.createGain(); out.gain.value = 0; out.connect(getOut()); out.connect(reverb(ac));
    out.gain.setTargetAtTime(1, ac.currentTime, 0.4);
    const busOf = makeBuses(ac, out);
    const t0 = ac.currentTime + 0.3;
    const c = { out, live: new Set(), stopped: false, timer: null };
    let k = 0;
    const schedule = () => {
      if (c.stopped) return;
      const horizon = ac.currentTime + 0.7;
      while (k < ev.length) {
        const e = ev[k], ts = t0 + at(e.t) + (e.hit ? 0 : (Math.random() - 0.5) * 0.014);
        if (ts > horizon) break;
        k++;
        const src = note(ac, e, ts, t0 + at(e.t + e.dur), busOf);
        c.live.add(src); src.onended = () => c.live.delete(src);
      }
      if (k >= ev.length) {
        clearInterval(c.timer);
        // the tune is done: let it ring out, then rest before the next
        const endAt = (t0 + at(beats) - ac.currentTime) * 1000 + 2500;
        const [r0, r1] = MOODS[m].rest;
        wait = setTimeout(() => { if (cur === c) { cur = null; try { out.disconnect(); } catch (e) {} } start(m); }, endAt + rand(r0, r1) * 1000);
      }
    };
    c.timer = setInterval(schedule, 120); schedule();
    cur = c;
  }
  return {
    play(m) {
      if (m === mood) return;
      if (m && !MOODS[m]) m = "woods";
      mood = m;
      clearTimeout(wait);
      stopCurrent(m ? 2.5 : 1.5);
      if (m) wait = setTimeout(() => start(m), 1200);
    },
    get mood() { return mood; },
    get playing() { return cur ? { piece: lastPiece, notes: cur.live.size } : null; },
  };
}
