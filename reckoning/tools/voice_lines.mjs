// Lists every line the story speaks, for both ways through it (as the
// brother, and as the sister), with the key the game looks its recording up by.
//
//   node reckoning/tools/voice_lines.mjs > reckoning/voice/lines.json
//
// A line built from something only known in play (a count, a cost) cannot be
// recorded ahead, and is left to the browser's own voice.
import { readFileSync } from "node:fs";
import { voiceKey, speakerOf } from "../js/voicekey.js";

const src = readFileSync(new URL("../js/story.js", import.meta.url), "utf8");
const CH = [...src.matchAll(/^async function ch(\d)\(/gm)].map(m => ({ n: +m[1], at: m.index }));
const chapterAt = i => (CH.filter(c => c.at <= i).pop() || { n: 0 }).n;

// the arguments of a call, split at top-level commas, strings respected
function args(s, i) {
  const out = []; let depth = 0, cur = "", q = null;
  for (; i < s.length; i++) {
    const c = s[i];
    if (q) { cur += c; if (c === "\\") { cur += s[++i]; continue; } if (c === q) q = null; continue; }
    if (c === '"' || c === "'" || c === "`") { q = c; cur += c; continue; }
    if (c === "(" || c === "[" || c === "{") depth++;
    if (c === ")" || c === "]" || c === "}") { if (depth === 0) { out.push(cur.trim()); return out; } depth--; }
    if (c === "," && depth === 0) { out.push(cur.trim()); cur = ""; continue; }
    cur += c;
  }
  return out;
}

const seen = new Map();
for (const who of ["brother", "sister"]) {
  const G = { who };
  const P = {
    get you() { return G.who === "brother" ? "Brother" : "Sister"; },
    get sib() { return G.who === "brother" ? "Sister" : "Brother"; },
    get sibLower() { return G.who === "brother" ? "sister" : "brother"; },
    get child() { return G.who === "brother" ? "boy" : "girl"; },
    get sibThey() { return G.who === "brother" ? "she" : "he"; },
    get sibThem() { return G.who === "brother" ? "her" : "him"; },
    get sibTheir() { return G.who === "brother" ? "her" : "his"; },
  };
  const YOU = () => `${P.you} (you)`;
  const narrator = who === "brother" ? "m" : "f";
  const ev = e => Function("P", "YOU", `return (${e});`)(P, YOU);

  for (const m of src.matchAll(/\b(say|bark|narrate)\(/g)) {
    const a = args(src, m.index + m[0].length);
    let name, text;
    try {
      if (m[1] === "narrate") { name = null; text = ev(a[0]); }
      else { name = ev(a[0]); text = ev(a[1]); }
    } catch (e) { continue; }          // built in play — left to the browser's voice
    if (typeof text !== "string" || !text.trim()) continue;
    const speaker = speakerOf(name, narrator);
    const key = voiceKey(speaker, text);
    if (!seen.has(key)) seen.set(key, { key, speaker, text, chapter: chapterAt(m.index), kind: m[1] });
  }
}
console.log(JSON.stringify([...seen.values()], null, 1));
