// ===========================================================================
//  FORESTER: RECKONING — Copyright (c) 2026 Roan Fraese / DeadlyDog Productions
// ===========================================================================

// How a spoken line finds its recording: who says it, and exactly what they
// say. Shared by the game and by tools/voice_lines.mjs, so both agree.

// "Brother (you)" is the brother; a line with no name is the narrator, who is
// whichever of the two you play, grown up and telling it
export function speakerOf(name, narratorGender) {
  if (!name) return narratorGender === "f" ? "Narrator (sister)" : "Narrator (brother)";
  return name.replace(/\s*\(you\)\s*/, "");
}

// FNV-1a, as hex — short, stable file names
export function voiceKey(speaker, text) {
  let h = 0x811c9dc5;
  const s = speaker + "|" + text;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, "0");
}
