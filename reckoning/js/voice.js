// ===========================================================================
//  FORESTER: RECKONING — Copyright (c) 2026 Roan Fraese / DeadlyDog Productions
// ===========================================================================

// Voices. Every line written into the story is recorded, acted, in voice/
// (tools/voice_gen.py makes them; an actor's take can replace any file). A
// line built in play — a count, a cost — has no recording, and falls back to
// the browser's own speech synthesis, each character with their own voice,
// pitch and pace.
import { speakerOf, voiceKey } from "./voicekey.js";

let recorded = new Set();
fetch("voice/index.json").then(r => r.ok ? r.json() : []).then(k => { recorded = new Set(k); }).catch(() => {});
const clip = new Audio();
clip.preload = "auto";

const CAST = {
  "Father":          { g: "m", pitch: 0.78, rate: 0.9 },
  "Brother":         { g: "m", pitch: 1.12, rate: 1.0 },
  "Sister":          { g: "f", pitch: 1.3, rate: 1.0 },
  "Jakob":           { g: "m", pitch: 0.62, rate: 0.86 },
  "The magistrate":  { g: "m", pitch: 0.55, rate: 0.82 },
  "Watchman":        { g: "m", pitch: 0.82, rate: 1.06 },
  "Frau Albers":     { g: "f", pitch: 1.15, rate: 1.06 },
  "A dock hand":     { g: "m", pitch: 0.95, rate: 1.1 },
};
const FEMALE = /female|woman|zira|susan|hazel|samantha|victoria|karen|moira|tessa|fiona|serena|libby|sonia|mia|aria|jenny|kate|amy|emma|natasha|clara/i;
const MALE = /male|david|george|daniel|james|ryan|guy|alex|fred|thomas|arthur|oliver|mark|rishi|brian|william|liam/i;

let voices = [];
function load() {
  if (!window.speechSynthesis) return;
  const all = speechSynthesis.getVoices().filter(v => /^en/i.test(v.lang));
  // British first — it is a Hanseatic city, but the players will forgive us
  all.sort((a, b) => (/GB/i.test(b.lang) - /GB/i.test(a.lang)) || (b.localService - a.localService));
  voices = all;
}
if (window.speechSynthesis) { load(); speechSynthesis.onvoiceschanged = load; }

function pick(g, key) {
  if (!voices.length) return null;
  const want = voices.filter(v => (g === "f" ? FEMALE : MALE).test(v.name) && !(g === "f" ? MALE : FEMALE).test(v.name.replace(/female/i, "")));
  const pool = want.length ? want : voices;
  let h = 0; for (const c of key) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return pool[h % pool.length];
}

export const VOICE = {
  enabled: true,
  narratorGender: "m",
  speak(name, text) {
    if (!this.enabled) return;
    this.stop();
    const key = voiceKey(speakerOf(name, this.narratorGender), text);
    if (recorded.has(key)) {
      clip.src = `voice/${key}.mp3`;
      clip.volume = window.G ? Math.min(1, window.G.settings.volume * 1.3) : 1;
      clip.play().catch(() => {});
      return;
    }
    if (!window.speechSynthesis) return;
    try {
      let who = (name || "").replace(/\s*\(you\)\s*/, "");
      let c = CAST[who];
      if (!c) c = name ? { g: /frau|woman|girl/i.test(who) ? "f" : "m", pitch: 1, rate: 1 } : { g: this.narratorGender, pitch: 0.95, rate: 0.88 };
      const u = new SpeechSynthesisUtterance(text.replace(/^\((quietly)\)\s*/, ""));
      const v = pick(c.g, who || "narrator");
      if (v) { u.voice = v; u.lang = v.lang; } else u.lang = "en-GB";
      u.pitch = c.pitch; u.rate = c.rate; u.volume = window.G ? Math.min(1, window.G.settings.volume * 1.3) : 1;
      if (!name && /^\(quietly\)/.test(text)) u.volume *= 0.6;
      speechSynthesis.speak(u);
    } catch (e) {}
  },
  stop() {
    clip.pause();
    try { window.speechSynthesis && speechSynthesis.cancel(); } catch (e) {}
  },
};
window.__voice = VOICE;
