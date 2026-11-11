// ===========================================================================
//  FORESTER: RECKONING — Copyright (c) 2026 Roan Fraese / DeadlyDog Productions
// ===========================================================================

// A REGIMENT'S BAND — a drummer and a fifer (the horse's trumpeters; for the Ottomans, a zurna and the great davul) who go with one arm of
// your company: they play its nation's march while it marches and stop when it halts. The tunes are the period's own,
// written down in ABC notation (see TUNES) and played here note by note on the instruments in audio.js — the fife, the
// natural trumpet and the zurna recorded, a held note or two of each pitched to the tune's notes; the drums' strokes recorded too.

import { AUDIO } from "./audio.js";

// ---- reading a tune: a small reader for the ABC notation the tunes are kept in ----
// (the headers M: L: K: Q:, notes A–G a–g with ' and , for the octave, ^ _ = for sharps, flats and naturals, lengths as
//  2, /2, 3/2, >, rests z, bars, and repeats |: :| — enough for a march tune; chords and ornaments are let go)
const KEYS = { C: 0, G: 1, D: 2, A: 3, E: 4, B: 5, "F#": 6, F: -1, Bb: -2, Eb: -3, Ab: -4, Db: -5 };
const SHARPS = ["F", "C", "G", "D", "A", "E", "B"], STEP = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
function keySig(K) {
  let k = (K || "C").trim().split(/\s+/)[0], mode = (K || "").toLowerCase();
  const minor = /^[A-G][#b]?m(?!ix)/.test(k) || /\bmin/.test(mode), dor = /dor/.test(mode), mix = /mix/.test(mode);
  k = k.replace(/(m|min|minor|maj|major|dor|dorian|mix|mixolydian)$/i, "");
  let n = KEYS[k] ?? 0;
  if (minor) n -= 3; else if (dor) n -= 2; else if (mix) n -= 1;
  const acc = {}; if (n > 0) for (let i = 0; i < n; i++) acc[SHARPS[i]] = 1; else for (let i = 0; i < -n; i++) acc[SHARPS[6 - i]] = -1;
  return acc;
}
const frac = s => { if (!s) return 1; if (s === "/") return 0.5; const m = /^(\d*)(\/+)?(\d*)$/.exec(s); if (!m) return 1; const a = m[1] ? +m[1] : 1; if (!m[2]) return a; const b = m[3] ? +m[3] : 2 ** m[2].length; return a / b; };
export function parseABC(abc) {
  const head = {}, body = [];
  for (const line of abc.split("\n")) { const m = /^([A-Za-z]):\s*(.*)$/.exec(line.trim()); if (m && !/^\|/.test(line.trim())) head[m[1]] = m[2]; else if (line.trim() && !line.trim().startsWith("%")) body.push(line); }
  const L = head.L ? frac(head.L.replace(/^1\//, "1/")) : 1 / 8, acc = keySig(head.K);
  const meter = head.M === "C" ? "4/4" : head.M === "C|" ? "2/2" : head.M || "4/4", [mn, md] = meter.split("/").map(Number);
  const Q = /(\d+)\s*$/.exec(head.Q || ""), qb = /^(\d+)\/(\d+)/.exec(head.Q || ""), bpm = Q ? +Q[1] : 100, qlen = qb ? +qb[1] / +qb[2] : 1 / 4;
  // (each note: a pitch (midi, or null for a rest) and its length in whole notes)
  const out = [], parts = []; let cur = [], bar = {}, i = 0, s = body.join(" ").replace(/"[^"]*"/g, "").replace(/![^!]*!/g, "").replace(/\{[^}]*\}/g, "").replace(/\[[^\]|0-9][^\]]*\]/g, m => m.slice(1, -1).match(/[_^=]*[A-Ga-g][,']*/)?.[0] || "");
  let ending = 0, firstEnd = [];
  const push = n => (ending === 1 ? firstEnd : cur).push(n);
  while (i < s.length) {
    const c = s[i];
    if (c === "|" || c === ":") {
      const m = /^(:*\|+\]?:*|:+)(\[?\d)?/.exec(s.slice(i)); const tok = m ? m[1] : c; i += m ? m[0].length : 1;
      bar = {};
      if (tok.startsWith(":")) { // the end of a repeat: what's been written since it began, again (with its first ending the first time)
        const seg = cur.slice(); parts.push(...seg, ...firstEnd, ...seg); cur = []; firstEnd = []; ending = 0;
      }
      if (tok.endsWith(":")) { parts.push(...cur); cur = []; }
      if (m && m[2]) ending = +m[2].replace("[", "");
      continue;
    }
    if (c === "z" || c === "x") { const m = /^[zx](\d*\/*\d*)/.exec(s.slice(i)); i += m[0].length; push({ midi: null, len: frac(m[1]) * L }); continue; }
    const m = /^([_^=]*)([A-Ga-g])([,']*)(\d*\/*\d*)(>|<)?/.exec(s.slice(i));
    if (m) {
      i += m[0].length;
      const letter = m[2].toUpperCase(), up = m[2] === m[2].toLowerCase() ? 12 : 0, oct = (m[3].match(/'/g) || []).length * 12 - (m[3].match(/,/g) || []).length * 12;
      let a = m[1] ? (m[1].includes("^") ? m[1].length : m[1].includes("_") ? -m[1].length : 0) : null;
      if (a != null) bar[letter + oct + up] = a; else a = bar[letter + oct + up] ?? acc[letter] ?? 0;
      let len = frac(m[4]) * L;
      const n = { midi: 60 + STEP[letter] + a + up + oct, len };
      if (m[5] === ">") { n.len = len * 1.5; push(n); const nx = /^\s*([_^=]*[A-Ga-g][,']*)(\d*\/*\d*)/.exec(s.slice(i)); if (nx) { s = s.slice(0, i) + nx[0].replace(nx[2], "") + "/" + s.slice(i + nx[0].length); } continue; }
      push(n); continue;
    }
    i++;
  }
  parts.push(...cur, ...firstEnd); for (const n of parts) out.push(n);
  return { notes: out, bpm, qlen, beat: md === 8 && mn % 3 === 0 ? 3 / 8 : 1 / md, bar: mn / md };
}

// ---- the tunes, by the colours that marched to them (filled from the period's own; see the changelog for sources) ----
// inst: the melody's instrument ("fife", "zurna", or null for drums alone); drum: "side" or "big"
// (the melodies from the printed sources of the day — Playford's Dancing Master, the Atkinson manuscript of 1694/95,
//  Valerius's Wilhelmus — as kept by the Traditional Tune Archive and Wikipedia; the tempos slowed to the ordinary
//  marching step of the 1680s. Only Lilliburlero and the Wilhelmus are certainly their nation's own; the French, the
//  Imperial and the German marches are tunes of the period noted down in England under those names. Where no march of the
//  time is known from the notes — the Swedes, the Spanish, the Danes, the Poles, Muscovy — the drums beat the march
//  alone, as is certain they did; the Ottomans and the Crimean Tatars march to the mehter's great drum in the düyek
//  cycle, the zurna holding its note over it)
const LILLIBURLERO = `M:6/4
L:1/8
Q:3/4=72
K:G
G3AG2 B4B2|A3BA2 c6|B2d2G2 c4B2|A2G2F2 G6:|
|:g4f2 g4d2|=f4f2 e4d2|e2f2g2 g4d2|e2d2B2 A6|
e2d2c2 B2c2d2|e2e2c2 B2c2d2|e2e2B2 c4B2|A2 G2 F2 G6:|]`;
const WILHELMUS = `M:4/4
L:1/8
Q:1/4=84
K:G
D2 | G2G2 ABcA | B2AB c2B2 | [M:2/4] AG A2 | [M:4/4] G6 D2 |
G2G2 ABcA | B2AB c2B2 | [M:2/4] AG A2 | [M:4/4] G6 Bc |
[M:3/4] d4 e2 | d4 c2 | B2AB c2 | B2A2G2 | [M:4/4] A6 D2 |
[M:3/4] GFGA B2 | A4 G2 | F2D2 EF | G2G2F2 | G6 |]`;
const FRENCH_MARCH = `M:C|
L:1/8
Q:1/2=72
K:C
c4 B3A|G4 G2G2|ABcA BcdB|c4 G4|c4 B3A|G4 G2G2|ABcA BcdB|c8||
(ef)g2 (ef) g2|f3e d2G2|c4 d2e2|e4 d4|(ef) g2 (eg)g2|f3e d2G2|A4 B4|c8|]`;
const LORRAIN = `M:2/2
L:1/4
Q:1/2=74
K:D
|: dd/d/ dd | d2 d2 | ef gf/e/ | f4 | aa/a/ aa | a2 f2 | ef gf/e/ | f4 :|
|: ff/f/ ff | f2 a2 | fe/f/ g/f/e/d/ | ef/g/ ag | f3/e/4f/4 gf | ed a/g/f/e/ | dd/d/ dd | d4 :|`;
const EUGENE = `M:C|
L:1/8
Q:1/2=74
K:D
F4A4|d4-d2 fg|a2f2d2f2|edef e2A2|F4A4|d4-d2e2|f^g a2 a3g|a8:|
|:e2 ee e2e2|e4 z4|f2 ff f2f2|f4 z4|a2ag f2 fe|d2d2A2A2|a2 ag f2 fe|d2d2A2A2|
D2DD D2F2|D2 DD D2fg|a2 de f2 fg|a2 de f2 fg|a2 gf e3d|d8:|]`;
// (düyek: düm, tek tek, düm, tek — in eighths, 1 2 1 2 2)
const DUYEK = [[1, 1], [2, 0], [1, 0], [2, 1], [2, 0]];
const fife = (name, abc) => ({ name, abc, inst: "fife", drum: "side" }), drums = name => ({ name, inst: null, drum: "side" });
export const TUNES = {
  english: fife("Lilliburlero", LILLIBURLERO), dutch: fife("the Wilhelmus", WILHELMUS), french: fife("a French march of the 1690s", FRENCH_MARCH),
  imperial: fife("the Duke of Lorrain's March", LORRAIN), saxon: fife("Prince Eugene's March", EUGENE), bavarian: fife("Prince Eugene's March", EUGENE),
  brandenburg: fife("Prince Eugene's March", EUGENE), hamburg: drums("the city's drum march"),
  swedish: drums("the Swedish march, beaten on the drum"), spanish: drums("the Spanish march, beaten on the drum"), danish: drums("the Danish march, beaten on the drum"),
  polish: drums("the march, beaten on the drum"), muscovite: drums("the streltsy's drum"),
  ottoman: { name: "the mehter's düyek", inst: "zurna", drone: 62, drum: "big", rhythm: DUYEK, bpm8: 150 },
  tatar: { name: "the kettledrums, in the düyek", inst: null, drum: "big", rhythm: DUYEK, bpm8: 140 },
};
const DEFAULT = { name: "the march", inst: null, drum: "side" };
// (the horse marched to no drum and fife: each troop had its trumpeter, the natural trumpet of the day — no valves,
//  only the notes of its harmonics — sounding the marches and the calls. A march in that manner, made for the game)
const TRUMPET_MARCH = `M:C
L:1/8
Q:1/4=92
K:C
|: G2 c2 c3 e | g2 e2 c4 | e2 g2 g3 e | c2 e2 G4 | c2 e2 g2 c'2 | e'2 d'2 c'4 | g2 e2 c2 e2 | d2 G2 c4 :|
|: g3 g c'2 g2 | e3 e g2 e2 | c2 e2 g2 e2 | d4 G4 | c'3 c' g2 e2 | c'2 e'2 d'4 | c'2 g2 e2 d2 | c4 c4 :|`;
const TRUMPETS = { name: "a trumpet march for the horse", abc: TRUMPET_MARCH, inst: "trumpet", drum: null };
// the band an arm marches with: the instruments of its two men (kit) and what to call them (who)
export const tuneFor = (team, gid = null) => {
  const T = TUNES[team] || DEFAULT;
  if (gid === "horse" && team !== "ottoman" && team !== "tatar") return { ...TRUMPETS, kit: ["trumpet", "trumpet"], who: "Two trumpeters" };
  return { ...T, kit: T.inst === "fife" ? ["drum", "fife"] : T.inst === "zurna" ? ["davul", "zurna"] : T.drum === "big" ? ["davul", "davul"] : ["drum", "drum"],
    who: T.inst === "fife" ? "Drummer and fifer" : T.inst === "zurna" ? "Zurna and davul" : T.drum === "big" ? "Two kettledrummers" : "Two drummers" };
};

// ---- a band at work: told each frame where it is and whether its arm is marching ----
export class Band {
  constructor(team, gid = null) {
    this.T = tuneFor(team, gid); this.song = this.T.abc ? parseABC(this.T.abc) : null;
    this.playing = false; this.next = 0; this.i = 0; this.beatAt = 0; this.beatN = 0;
  }
  // (the length of a whole note in seconds at the tune's tempo)
  whole() { const S = this.song; return S ? 60 / S.bpm / S.qlen : 2.2; }
  tick(at, marching) {
    const now = AUDIO.now(); if (!now) return;
    if (!marching) { if (this.playing) { this.playing = false; if (this.T.drum) AUDIO[this.T.drum === "big" ? "bigDrum" : "sideDrum"]({ at, when: now + 0.05, accent: true, flam: true }); } return; }
    if (!this.playing) { this.playing = true; this.next = now + 0.15; this.i = 0; this.beatAt = this.next; this.beatN = 0; }
    // (back from a pause, or a window out of sight: picked up where the clock is now, not every missed note at once)
    if (this.beatAt < now - 0.2) this.beatAt = now + 0.05; if (this.next < now - 0.2) this.next = now + 0.05;
    const W = this.whole(), S = this.song, beat = (S ? S.beat : 1 / 4) * W, perBar = Math.round((S ? S.bar : 1) / (S ? S.beat : 1 / 4)) || 4;
    // the melody, a little way ahead of the clock
    if (S && this.T.inst && !this.T.rhythm) while (this.next < now + 0.5) {
      const n = S.notes[this.i % S.notes.length]; this.i++;
      const dur = n.len * W; if (n.midi != null) AUDIO[this.T.inst](n.midi + (this.T.inst === "fife" ? 12 : 0), dur, { at, when: this.next, accent: this.i % 4 === 1 });
      this.next += dur;
    }
    // (a drum cycle of its own — the mehter's düyek: the great drum's heavy stroke and its light one; the zurna holding
    //  its note across each cycle, renewing it)
    if (this.T.rhythm) {
      const e8 = 60 / (this.T.bpm8 || 150), R = this.T.rhythm, cyc = R.reduce((t, [d]) => t + d, 0) * e8;
      while (this.beatAt < now + 0.5) {
        const [d, heavy] = R[this.beatN % R.length];
        if (this.beatN % R.length === 0 && this.T.inst === "zurna") AUDIO.zurna(this.T.drone + (Math.floor(this.beatN / R.length) % 4 === 3 ? 2 : 0), cyc * 0.97, { at, when: this.beatAt });
        AUDIO.bigDrum({ at, when: this.beatAt, accent: !!heavy, vol: heavy ? 1 : 0.65 });
        this.beatAt += d * e8; this.beatN++;
      }
      return;
    }
    // the drum, beating the step: the first of the bar the loudest, with a flam
    if (!this.T.drum) { this.beatAt = Math.max(this.beatAt, now); return; }
    while (this.beatAt < now + 0.5) {
      const first = this.beatN % perBar === 0;
      AUDIO[this.T.drum === "big" ? "bigDrum" : "sideDrum"]({ at, when: this.beatAt, accent: first, flam: first, vol: this.T.drum === "big" && !first ? 0.7 : 1 });
      if (this.T.drum !== "big" && !first && Math.random() < 0.35) AUDIO.sideDrum({ at, when: this.beatAt + beat / 2, vol: 0.5 });
      this.beatAt += beat; this.beatN++;
    }
    if (!this.T.inst) this.next = this.beatAt;
  }
}
