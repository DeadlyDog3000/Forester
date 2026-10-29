// ===========================================================================
//  FORESTER: RECKONING — Copyright (c) 2026 Roan Fraese / DeadlyDog Productions
// ===========================================================================

// THE MUSIC, PLAYED. Real music of the time and just after it — Charpentier, Lully, Purcell, Pachelbel, Corelli, Bach,
// Vivaldi — in recordings their players gave to everyone (public domain, CC0, or Creative Commons with credit;
// every one named in the credits and in art/music/CREDITS.md). For each mood the game asks for, the pieces that suit
// it: one is played, then the quiet the mood wants (music.js's MOODS), then another — never the same twice running.
// A change of mood fades the one playing out as the next comes in. Should a recording not load, another of the mood's
// is tried a little later, and it's quiet meanwhile: only real music, played by people, is heard.

import { MOODS } from "./music.js";

// the pieces, by file (art/music/<name>.ogg)
const SETS = {
  title:      ["te_deum", "canon_guitar", "goldberg_aria", "corelli_1"],
  court:      ["lully_turcs", "corelli_1", "brandenburg3", "canon_guitar"],
  lobby:      ["spring_allegro", "brandenburg3", "lully_turcs", "canon_guitar"],
  home:       ["cello_prelude", "canon_guitar", "air", "innomine6", "goldberg_capo"],
  unease:     ["innomine7", "winter_largo"],
  dread:      ["toccata"],
  grief:      ["air", "winter_largo", "innomine6"],
  flight:     ["summer_presto", "winter_allegro"],
  woods:      ["cello_prelude", "innomine6", "innomine7", "spring_largo", "goldberg_aria", "canon_guitar"],
  hope:       ["spring_allegro", "canon_guitar", "goldberg_capo"],
  settlement: ["spring_allegro", "cello_prelude", "canon_guitar", "brandenburg3"],
  evening:    ["air", "goldberg_aria", "spring_largo", "innomine6"],
  night:      ["goldberg_aria", "goldberg_capo", "winter_largo", "innomine7"],
  winter:     ["winter_largo", "winter_allegro", "goldberg_capo"],
  battle:     ["summer_presto", "winter_allegro", "lully_turcs"],
  feast:      ["lully_turcs", "brandenburg3"],
};
const LEVEL = 0.8;          // (the recordings against the players' level on the same bus)
const KEEP = 4;             // (decoded pieces kept ready: a few minutes of sound each, so not too many)

export function createRecorded(getCtx, getOut) {
  let mood = null, cur = null, wait = null, last = null, gen = 0;
  const bufs = new Map(), loading = new Map();
  const load = async (ac, name) => {
    if (bufs.has(name)) { const b = bufs.get(name); bufs.delete(name); bufs.set(name, b); return b; }
    if (!loading.has(name)) loading.set(name, (async () => {
      const r = await fetch(new URL(`../art/music/${name}.ogg`, import.meta.url));
      if (!r.ok) throw new Error(`music ${name}: ${r.status}`);
      const b = await ac.decodeAudioData(await r.arrayBuffer());
      bufs.set(name, b);
      while (bufs.size > KEEP) bufs.delete(bufs.keys().next().value);
      return b;
    })().finally(() => loading.delete(name)));
    return loading.get(name);
  };
  const pick = m => {
    const list = SETS[m] || SETS.woods, rest = list.filter(n => n !== last);
    const from = rest.length ? rest : list;
    return from[Math.floor(Math.random() * from.length)];
  };
  function stopCurrent(fade = 2.5) {
    const c = cur; cur = null; if (!c) return;
    const ac = getCtx(); if (!ac) return;
    const t = ac.currentTime;
    try { c.g.gain.cancelScheduledValues(t); c.g.gain.setValueAtTime(c.g.gain.value, t); c.g.gain.linearRampToValueAtTime(0, t + fade); c.s.stop(t + fade + 0.1); } catch (e) {}
  }
  async function start(m, n) {
    if (n !== gen || mood !== m) return;
    const ac = getCtx();
    if (!ac || !window.__reckonMusic) { wait = setTimeout(() => start(m, n), 4000); return; }
    const name = pick(m);
    let buf;
    try { buf = await load(ac, name); }
    catch (e) {
      // (a piece that won't load: another of the mood's in a while, and quiet meanwhile — only real music is played,
      //  never the made-up players in its place)
      last = name;
      if (n === gen && mood === m) wait = setTimeout(() => start(m, n), 8000);
      return;
    }
    if (n !== gen || mood !== m) return;
    last = name;
    const s = ac.createBufferSource(), g = ac.createGain(), t = ac.currentTime;
    s.buffer = buf; g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(LEVEL, t + 3);
    s.connect(g); g.connect(getOut()); s.start(t + 0.05);
    const c = cur = { s, g, name };
    s.onended = () => {
      if (cur !== c) return; cur = null;
      const [r0, r1] = (MOODS[m] || MOODS.woods).rest;
      wait = setTimeout(() => start(m, n), (r0 + Math.random() * (r1 - r0)) * 1000);
    };
    // (the next one fetched while this one plays, so there's no wait for it)
    const next = (SETS[m] || []).filter(x => x !== name);
    if (next.length) load(ac, next[Math.floor(Math.random() * next.length)]).catch(() => {});
  }
  return {
    play(m) {
      if (m === mood) return;
      if (m && !SETS[m]) m = "woods";
      mood = m; gen++;
      clearTimeout(wait);
      stopCurrent(m ? 2.5 : 1.5);
      if (m) { const n = gen; wait = setTimeout(() => start(m, n), 1200); }
    },
    get mood() { return mood; },
    get playing() { return cur ? { piece: cur.name } : null; },
  };
}
