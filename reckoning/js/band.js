// ===========================================================================
//  FORESTER: RECKONING — Copyright (c) 2026 Roan Fraese / DeadlyDog Productions
// ===========================================================================

// A REGIMENT'S BAND — a drummer and a fifer (or, for the Ottomans, a zurna and the great davul) who go with one arm of
// your company: they play its nation's march while it marches and stop when it halts. The tunes are the period's own,
// written down in ABC notation (see TUNES) and played here note by note on the instruments in audio.js — made in
// code, as the rest of the game's sound is.

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
export const TUNES = {};
const DEFAULT = { name: "the march", inst: null, drum: "side" };
export const tuneFor = team => TUNES[team] || DEFAULT;

// ---- a band at work: told each frame where it is and whether its arm is marching ----
export class Band {
  constructor(team) {
    this.T = tuneFor(team); this.song = this.T.abc ? parseABC(this.T.abc) : null;
    this.playing = false; this.next = 0; this.i = 0; this.beatAt = 0; this.beatN = 0;
  }
  // (the length of a whole note in seconds at the tune's tempo)
  whole() { const S = this.song; return S ? 60 / S.bpm / S.qlen : 2.2; }
  tick(at, marching) {
    const now = AUDIO.now(); if (!now) return;
    if (!marching) { if (this.playing) { this.playing = false; AUDIO[this.T.drum === "big" ? "bigDrum" : "sideDrum"]({ at, when: now + 0.05, accent: true, flam: true }); } return; }
    if (!this.playing) { this.playing = true; this.next = now + 0.15; this.i = 0; this.beatAt = this.next; this.beatN = 0; }
    const W = this.whole(), S = this.song, beat = (S ? S.beat : 1 / 4) * W, perBar = Math.round((S ? S.bar : 1) / (S ? S.beat : 1 / 4)) || 4;
    // the melody, a little way ahead of the clock
    if (S && this.T.inst) while (this.next < now + 0.5) {
      const n = S.notes[this.i % S.notes.length]; this.i++;
      const dur = n.len * W; if (n.midi != null) AUDIO[this.T.inst](n.midi + (this.T.inst === "fife" ? 12 : 0), dur, { at, when: this.next });
      this.next += dur;
    }
    // the drum, beating the step: the first of the bar the loudest, with a flam
    while (this.beatAt < now + 0.5) {
      const first = this.beatN % perBar === 0;
      AUDIO[this.T.drum === "big" ? "bigDrum" : "sideDrum"]({ at, when: this.beatAt, accent: first, flam: first, vol: this.T.drum === "big" && !first ? 0.7 : 1 });
      if (this.T.drum !== "big" && !first && Math.random() < 0.35) AUDIO.sideDrum({ at, when: this.beatAt + beat / 2, vol: 0.5 });
      this.beatAt += beat; this.beatN++;
    }
    if (!this.T.inst) this.next = this.beatAt;
  }
}
