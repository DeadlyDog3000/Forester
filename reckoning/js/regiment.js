// ===========================================================================
//  FORESTER: RECKONING — Copyright (c) 2026 Roan Fraese / DeadlyDog Productions
// ===========================================================================

// THE REGIMENT THAT REMEMBERS. Your company against bots isn't raised fresh each time: the men who come through a battle
// march in the next — the same names, the same faces — the steadier and the better shots for every field they've
// stood on, and made corporal and sergeant as their service earns it. The fallen are gone from the rolls (a few of
// them only wounded, back for the next); the gaps filled with recruits. Each team its own regiment, and its battle
// honours: the fields it won.

const KEY = "reckoning.regiment.v1", MAX_MEN = 140, MAX_HONOURS = 16;
const read = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; } };
const write = v => { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch (e) {} };
export const regimentOf = team => { const all = read(); return all[team] || { men: [], honours: [], fought: 0 }; };
const save = (team, R) => { const all = read(); all[team] = R; write(all); };

// what a man's service is worth in the field: his aim and his hands, and his nerve
export const vetSkill = v => v ? Math.min(0.15, (v.battles | 0) * 0.025) : 0;
export const vetBrave = v => v ? 1 + Math.min(0.3, (v.battles | 0) * 0.05) : 1;

// the men for a battle: for each place in the muster (its arm), the longest-serving of that arm not already taken —
// or null, a recruit
export function rollFor(team, kinds) {
  const R = regimentOf(team), used = new Set();
  return kinds.map(k => { const v = R.men.filter(m => m.kind === k && !used.has(m.id)).sort((a, b) => b.battles - a.battles)[0]; if (v) used.add(v.id); return v || null; });
}

// after the battle: the roll called. men: [{ vet, kind, name, seed, alive }]; place: where it was fought
// returns what's to be said of it: { promoted: [{ name, rank }], fell: n, joined: n, honour }
export function muster(team, men, won, place) {
  const R = regimentOf(team), out = { promoted: [], fell: 0, wounded: 0, joined: 0, honour: null };
  const byId = new Map(R.men.map(m => [m.id, m]));
  for (const m of men) {
    if (m.vet && byId.has(m.vet.id)) {
      const v = byId.get(m.vet.id);
      if (m.alive) { v.battles++; if (won) v.wins = (v.wins | 0) + 1; }
      // (the fallen: most of them dead, some only wounded — back on the rolls for the next field)
      else if (Math.random() < 0.3) out.wounded++;
      else { byId.delete(v.id); out.fell++; }
    } else if (m.alive) {
      const id = (R.next = (R.next | 0) + 1);
      byId.set(id, { id, name: m.name, kind: m.kind, seed: m.seed, battles: 1, wins: won ? 1 : 0, rank: null });
      out.joined++;
    }
  }
  R.men = [...byId.values()].sort((a, b) => b.battles - a.battles).slice(0, MAX_MEN);
  // (the ranks, by service: in each arm its sergeant, the longest-serving of four fields or more; and a corporal to
  //  every ten men, from those of two or more)
  const was = new Map(R.men.map(m => [m.id, m.rank]));
  const arms = {}; for (const m of R.men) (arms[m.kind] ||= []).push(m);
  for (const list of Object.values(arms)) {
    list.sort((a, b) => b.battles - a.battles || (b.wins | 0) - (a.wins | 0));
    const corporals = Math.max(1, Math.floor(list.length / 10));
    list.forEach((m, i) => { m.rank = i === 0 && m.battles >= 4 ? "sergeant" : i > 0 && i <= corporals && m.battles >= 2 ? "corporal" : null; });
  }
  for (const m of R.men) if (m.rank && m.rank !== was.get(m.id) && (m.rank === "sergeant" || !was.get(m.id))) out.promoted.push({ name: m.name, rank: m.rank });
  R.fought = (R.fought | 0) + 1;
  if (won && place) { out.honour = place; R.honours = [{ place, at: Date.now() }, ...(R.honours || [])].slice(0, MAX_HONOURS); }
  save(team, R);
  return out;
}
