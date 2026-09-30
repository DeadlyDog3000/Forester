// ===========================================================================
//  FORESTER: RECKONING — Copyright (c) 2026 Roan Fraese / DeadlyDog Productions
// ===========================================================================

// Ambitions: what free play is for. A handful of long aims, each with a
// reward, looked at once a day — and the last of them the reason for all of
// it: Father's name, written back into the rolls in Hamburg.

import { UI } from "./ui.js";
import { G } from "./engine.js";

const souls = t => t.S.people.length + 2;
const done = (t, type) => t.S.buildings.filter(b => b.done && (!type || b.type === type)).length;
const walls = t => t.S.buildings.filter(b => b.done && (b.type === "palisade" || b.type === "gate" || b.type === "stonewall")).length;
const brick = t => t.S.buildings.filter(b => b.done && (b.tier || 1) >= 3).length;
const tools = () => (G.body && G.body.tools) || {};

export const AMBITIONS = [
  { id: "village", name: "A village", aim: "Eight souls, and six buildings standing",
    progress: t => `${souls(t)} of 8 souls · ${done(t)} of 6 buildings`, met: t => souls(t) >= 8 && done(t) >= 6,
    reward: "20 DM, from a merchant who heard of you", give: t => { t.S.coin = (t.S.coin || 0) + 20; },
    news: "Word reaches Bergedorf: there is a village in the old woods, where there was nothing." },
  { id: "bread", name: "Nobody goes hungry", aim: "A bakery, and thirty loaves in the store",
    progress: t => `bakery ${t.has("bakery") ? "built" : "not yet"} · ${t.S.bread || 0} of 30 bread`, met: t => t.has("bakery") && (t.S.bread || 0) >= 30,
    reward: "15 DM, and everyone the happier for it", give: t => { t.S.coin = (t.S.coin || 0) + 15; },
    news: "The first winter anyone can remember where nobody in the clearing went to bed hungry." },
  { id: "walls", name: "Behind walls", aim: "Eight lengths of wall or gates",
    progress: t => `${walls(t)} of 8`, met: t => walls(t) >= 8,
    reward: "The raiders think twice: the next raid comes four days later", give: t => { if (t.S.raid) t.S.raid.next = (t.S.raid.next || 0) + 4; },
    news: "Men on the road talk of a stockade in the woods, and go round it." },
  { id: "iron", name: "An age of iron", aim: "A forge, and an iron pickaxe or axe of your own",
    progress: t => `forge ${t.has("forge") ? "built" : "not yet"} · your best pick ${["none", "wood", "stone", "copper", "bronze", "iron"][tools().pick || 0]}`,
    met: t => t.has("forge") && ((tools().pick || 0) >= 5 || (tools().axe || 0) >= 5),
    reward: "Five tools for the settlers, from the smith's spare iron", give: t => { t.S.tools = (t.S.tools || 0) + 5; },
    news: "Iron from your own ground, worked at your own forge." },
  { id: "market", name: "A market town", aim: "A market and a town hall",
    progress: t => `market ${t.has("market") ? "built" : "not yet"} · town hall ${t.has("townhall") ? "built" : "not yet"}`, met: t => t.has("market") && t.has("townhall"),
    reward: "30 DM, and the settlement is marked as a town on the map of Europe", give: t => { t.S.coin = (t.S.coin || 0) + 30; t.S.isTown = true; },
    news: "The Amtmann writes it into his book: a town, in the old woods, with a market day." },
  { id: "brick", name: "Built to last", aim: "Five buildings rebuilt in brick",
    progress: t => `${brick(t)} of 5`, met: t => brick(t) >= 5,
    reward: "40 DM", give: t => { t.S.coin = (t.S.coin || 0) + 40; },
    news: "Brick, as the Hanse builds. Whatever comes up the road now, this place will outlast it." },
  { id: "crown", name: "Stand against a crown", aim: "Beat back a foreign crown's soldiers, twice",
    progress: t => `${t.S.crownsBeaten || 0} of 2`, met: t => (t.S.crownsBeaten || 0) >= 2,
    reward: "50 DM, and a name the crowns know", give: t => { t.S.coin = (t.S.coin || 0) + 50; },
    news: "Soldiers of a crown came up your road, and went back down it." },
  { id: "name", name: "His name, written again", aim: "A town hall in brick, and 150 DM to send to Hamburg with a petition",
    progress: t => `town hall in brick ${t.S.buildings.some(b => b.done && b.type === "townhall" && (b.tier || 1) >= 3) ? "yes" : "not yet"} · ${G.dm(t.S.coin)} of 150 DM`,
    met: t => t.S.buildings.some(b => b.done && b.type === "townhall" && (b.tier || 1) >= 3) && (t.S.coin || 0) >= 150,
    reward: "Father's name is written back into the rolls of Hamburg", give: t => { t.S.coin -= 150; t.S.nameRestored = t.day; },
    news: "A letter from Jakob, in his careful hand: the Rath has read your petition. Your father's name stands in the rolls again, where they struck it out.", last: true },
];

// once a day: anything newly met is done, rewarded, and told
export function ambitionsTick(t) {
  const got = (t.S.ambitions ??= {});
  for (const a of AMBITIONS) {
    if (got[a.id] != null || !a.met(t)) continue;
    got[a.id] = t.day;
    a.give(t);
    t.persist();
    UI.news({ title: a.last ? "His name, written again" : `Ambition: ${a.name}`, sub: `${a.news} — ${a.reward}.`, img: a.last ? "event_peace" : "event_caravan" });
    if (a.last && G.world) {
      const sib = (G.world.actors || []).find(x => x.isSibling);
      if (sib) UI.bark(G.who === "sister" ? "Brother" : "Sister", "They wrote it back. In the rolls, in ink. Father's name. ...I'm going to sit down for a minute.", 6);
    }
  }
}
export const ambitionsDone = t => Object.keys(t.S.ambitions || {}).length;
