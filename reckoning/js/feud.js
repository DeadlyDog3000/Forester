// ===========================================================================
//  FORESTER: RECKONING — Copyright (c) 2026 Roan Fraese / DeadlyDog Productions
// ===========================================================================
// FAMILIES AND FEUDS, as the first Forester has them. Everyone has a family name, and some who come up the road
// are kin to someone already here. Everyone forms a view of the people they live beside — and it moves for reasons
// they could name: a quarrel over a boundary stake, a creed they can't abide, a generous neighbour. Let a view sour
// far enough and it stops being an opinion: the two families take it up, and fight on sight. The watch can pull them
// apart and lock up whoever started it; you can pay blood money to end it; or it burns itself out — sometimes over
// a grave.
import { G } from "./engine.js";
import { UI } from "./ui.js";
import { AUDIO } from "./audio.js";
import { faithOf } from "./faith.js";

export const SURNAMES = ["Brandt", "Kessler", "Vogt", "Meier", "Schröder", "Krüger", "Lange", "Hartmann", "Petersen", "Timm", "Wulf", "Ahrens", "Behrens", "Lüders", "Stender", "Rehder", "Holst", "Dreyer", "Möller", "Witt"];
const OP_MIN = -100, OP_MAX = 100;
const FEUD_AT = -70;            // where dislike becomes intent
const FEUD_DAYS = 4;            // how long the blood stays up, if nothing is done
const MAX_FEUDS = 2;            // how many quarrels the settlement carries at once
const BEATEN = 25;              // hp at which someone has had the worst of it
// what people in a forest settlement actually fall out over
const GRIEVANCES = [
  "over a debt", "over a boundary stake", "over a borrowed axe", "over whose turn it was at the well",
  "over a share of the harvest", "over an insult at the fire", "over a dog", "over a place at the table",
  "over an old score from Hamburg", "over the price of a door", "over a lie told about them", "over a courtship",
  "over a pig that got into the rye", "over who felled whose tree",
];

// ---- families ----
export const famOf = p => p && p.family;
export const fullName = p => p ? `${p.name}${p.family ? " " + p.family : ""}` : "";
export const families = S => { const m = {}; for (const p of S.people) if (p.family) (m[p.family] ??= []).push(p); return m; };
// a family name for everyone who hasn't one: from their seed, the same every time; a child takes a grown woman's
export function ensureFamilies(S) {
  for (const p of S.people) {
    if (p.family || p.child) continue;
    const used = new Set(S.people.map(q => q.family).filter(Boolean));
    let i = Math.abs((p.seed || p.name.length * 31) * 7) % SURNAMES.length;
    for (let k = 0; k < SURNAMES.length && used.has(SURNAMES[i]); k++) i = (i + 1) % SURNAMES.length;
    p.family = SURNAMES[i];
  }
  for (const p of S.people) if (!p.family && p.child) { const mum = S.people.find(q => !q.child && q.sex === "f") || S.people.find(q => !q.child); p.family = mum ? mum.family : SURNAMES[0]; }
}
// someone new up the road: now and then, kin to a family already here
export function kinFor(S, p) {
  const fams = Object.entries(families(S)).filter(([, ps]) => ps.length < 4);
  if (fams.length && Math.random() < 0.35) { const [f, ps] = fams[Math.floor(Math.random() * fams.length)]; p.family = f; p.kin = ps[0].name; return ps[0]; }
  const used = new Set(S.people.map(q => q.family));
  p.family = SURNAMES.find(n => !used.has(n)) || SURNAMES[Math.floor(Math.random() * SURNAMES.length)];
  return null;
}

// ---- what they think of each other ----
const opOf = (c, o) => (c.op && c.op[o.name]) || 0;
function nudge(town, c, o, by, why) {
  if (!c || !o || c === o) return;
  c.op ??= {};
  const was = c.op[o.name] || 0, now = Math.max(OP_MIN, Math.min(OP_MAX, was + by));
  if (Math.abs(now) < 0.5) delete c.op[o.name]; else c.op[o.name] = Math.round(now * 10) / 10;
  // and why: the reasons they could give, the same reason added up, the few that weigh most kept
  if (why) {
    c.opWhy ??= {}; const list = (c.opWhy[o.name] ??= []);
    const e = list.find(x => x[1] === why);
    if (e) { e[0] = Math.round((e[0] + by) * 10) / 10; e[2] = town.day; } else list.push([Math.round(by * 10) / 10, why, town.day]);
    list.sort((x, y) => Math.abs(y[0]) - Math.abs(x[0])); list.length = Math.min(list.length, 5);
  }
  if (was > FEUD_AT && now <= FEUD_AT) startFeud(town, c, o);
}
export const opinionOf = opOf;
const temperHeat = p => p.temper === "hot" ? 1.5 : p.temper === "even" ? 0.55 : 1;

export function feudsOf(S) { return (S.feuds ??= []); }
export function feudFor(S, p) { return p && p.family ? feudsOf(S).find(f => !f.over && (f.a === p.family || f.b === p.family)) : null; }
const other = (f, fam) => (f.a === fam ? f.b : f.a);

export function startFeud(town, c, o) {
  const S = town.S;
  if (c.child || o.child || c.rebel || !S.people.includes(o)) return;
  if (feudFor(S, c) || feudFor(S, o)) return;                      // one quarrel at a time
  if (feudsOf(S).filter(f => !f.over).length >= MAX_FEUDS) return;
  const over = c.grievance || GRIEVANCES[Math.floor(Math.random() * GRIEVANCES.length)];
  // kin: the whole of both families take it up. The same family: it's between the two of them alone
  const f = { a: c.family, b: o.family, by: c.name, at: o.name, why: over, day: town.day, until: town.day + Math.max(1, FEUD_DAYS - (town.hallTier ? 1 + Math.floor(town.hallTier / 2) : 0)), deaths: 0, brawls: 0 };
  if (c.family === o.family) { f.a = f.b = null; f.pa = c.name; f.pb = o.name; }
  feudsOf(S).push(f); town.persist();
  S.feudCount = (S.feudCount || 0) + 1;
  G.guide && G.guide("feud");
  if (f.a) UI.news && UI.news({ title: `A feud: the ${f.a}s and the ${f.b}s`, sub: `${fullName(c)} and ${fullName(o)} fell out ${over}, and it has gone past words. Both families have taken it up — they'll come to blows on sight. Your watch can stop it, or you can pay to end it (F by any of them).`, img: "event_war" });
  else UI.hint(`${c.name} and ${o.name} ${c.family ? `— both ${c.family}s — ` : ""}have fallen out for good ${over}, and mean to settle it.`, 7);
}
export function endFeud(town, f, why) {
  if (!f || f.over) return;
  f.over = true;
  const S = town.S, side = fam => S.people.filter(p => (f.a ? p.family === fam : p.name === fam));
  const A = side(f.a || f.pa), B = side(f.b || f.pb);
  // the bad blood eases, though it doesn't all go
  for (const p of A) for (const q of B) { if (p.op && p.op[q.name] < -20) p.op[q.name] = -20; if (q.op && q.op[p.name] < -20) q.op[p.name] = -20; }
  town.persist();
  const who = f.a ? `the ${f.a}s and the ${f.b}s` : `${f.pa} and ${f.pb}`;
  if (why === "paid") UI.hint(`Blood money paid, and hands shaken at the fire: the feud between ${who} is over.`, 6);
  else if (why === "time") UI.hint(`The feud between ${who} has burned itself out.`, 5);
}
// where someone stands: which feud, and against whom
const sideOf = (f, p) => f.a ? (p.family === f.a ? "a" : p.family === f.b ? "b" : null) : (p.name === f.pa ? "a" : p.name === f.pb ? "b" : null);
const foesOf = (S, f, p) => { const s = sideOf(f, p); return S.people.filter(q => q !== p && !q.child && sideOf(f, q) && sideOf(f, q) !== s); };

// The slow drift, every few seconds: two people who live here take stock of each other. Sometimes it's a quarrel.
export function feudTick(town, dt) {
  const S = town.S;
  if (!S.people || S.people.length < 2 || town.isNight() || (town.raids && town.raids.active) || (S.revolt && S.revolt.active)) return;
  if ((town._socT = (town._socT || 4) - dt) > 0) return;
  town._socT = 5 + Math.random() * 6;
  ensureFamilies(S);
  const grown = S.people.filter(p => !p.child);
  if (grown.length < 2) return;
  const c = grown[Math.floor(Math.random() * grown.length)];
  const o = grown.filter(q => q !== c)[Math.floor(Math.random() * (grown.length - 1))];
  // a falling-out between two particular people, owing nothing to how well the place is run
  const spark = 0.045 * (c.temper === "hot" ? 1.7 : c.temper === "even" ? 0.55 : 1);
  if (Math.random() < spark) {
    const over = GRIEVANCES[Math.floor(Math.random() * GRIEVANCES.length)];
    const bitter = opOf(c, o) < -25 ? 1.5 : 1;
    const by = -(9 + Math.random() * 9) * bitter * temperHeat(c);
    c.grievance = over;
    nudge(town, c, o, by, `a quarrel ${over}`); nudge(town, o, c, -(4 + Math.random() * 8) * bitter * temperHeat(o), `a quarrel with ${c.name} ${over}`);
    // and the families take sides: kin think the worse of whoever crossed one of theirs
    if (c.family !== o.family) {
      for (const k of S.people) if (k !== c && k.family === c.family && !k.child) nudge(town, k, o, by * 0.2, `took ${c.name}'s side ${over}`);
      for (const k of S.people) if (k !== o && k.family === o.family && !k.child) nudge(town, k, c, by * 0.1, `took ${o.name}'s side ${over}`);
    }
    if (opOf(c, o) < -35 && Math.random() < 0.6) UI.hint(`${fullName(c)} and ${fullName(o)} have words ${over}.`, 4);
    return;
  }
  // the everyday: each thing that moves them, with its reason
  const k = c.temper === "even" ? 0.6 : 1, grudge = opOf(c, o) < -15;
  const mood = town.mood(c).value;
  const fc = faithOf(c), fo = faithOf(o);
  const why = [];
  if (mood > 55) why.push([3, "good times in the settlement"]); else if (mood < 30) why.push([-0.8, "everyone's short-tempered when times are hard"]);
  if (c.family && c.family === o.family) why.push([3, "family"]);
  if (fc !== fo) why.push([-1, "another creed"]); else why.push([fc !== "lutheran" ? 2 : 1, "the same faith"]);
  if (o.job && o.job === c.job) why.push([1.5, "work side by side"]);
  if (o.temper === "generous") why.push([2.5, "generous"]);
  if (o.temper === "grasping") why.push([-2.5, "grasping"]);
  if (o.mark === "disgraced") why.push([-1.5, "disgraced"]);
  if (c.sick > 0 && !(o.sick > 0)) why.push([-1, "sick and resentful"]);
  // (goodwill doesn't wash a real grudge away)
  for (const [n, w] of why) nudge(town, c, o, n * k * (n > 0 && grudge ? 0.3 : 1), w);
  // and time: once a day, the old grudges soften a little, where there's no feud keeping them up
  if (S.opDay !== town.day) {
    S.opDay = town.day;
    for (const p of S.people) for (const [n, v] of Object.entries(p.op || {})) if (v < 0) {
      const q = S.people.find(x => x.name === n);
      if (q && !(feudFor(S, p) && feudFor(S, p) === feudFor(S, q))) nudge(town, p, q, Math.min(-v, 4 + 2 * (town.hallTier || 0)), town.hallTier ? "time heals, and the council hears them out" : "time heals");
    }
  }
  // the feuds run their course
  for (const f of feudsOf(S)) if (!f.over && town.day >= f.until) endFeud(town, f, "time");
}

// For the Families tab: each family, its people, and what it makes of every other family — on average, and why.
export function familyReport(town) {
  const S = town.S; ensureFamilies(S);
  const fams = families(S), names = Object.keys(fams).sort();
  const out = {};
  for (const f of names) {
    const ps = fams[f], grown = ps.filter(p => !p.child);
    const toward = {};
    for (const g of names) {
      if (g === f) continue;
      const them = fams[g].filter(q => !q.child);
      let sum = 0, n = 0; const why = {};
      for (const p of grown) for (const q of them) {
        sum += opOf(p, q); n++;
        for (const [d, w] of ((p.opWhy || {})[q.name] || [])) { const k = w.replace(/^took (\S+)'s side/, "took a side"); why[k] = (why[k] || 0) + d; }
      }
      const feud = feudsOf(S).find(x => !x.over && ((x.a === f && x.b === g) || (x.a === g && x.b === f)));
      toward[g] = { value: n ? Math.round(sum / n) : 0, n, feud, why: Object.entries(why).filter(([, d]) => Math.abs(d) >= 1).sort((x, y) => Math.abs(y[1]) - Math.abs(x[1])).slice(0, 5).map(([w, d]) => [Math.round(d / Math.max(1, n)), w]) };
    }
    out[f] = { people: ps, toward, feud: feudsOf(S).find(x => !x.over && (x.a === f || x.b === f)) };
  }
  return out;
}

// how a feud weighs on a settler's mood
export function feudMood(town, p) {
  const out = [], S = town.S;
  if (p.child) return out;
  for (const f of feudsOf(S)) {
    if (f.over) continue;
    const s = sideOf(f, p);
    if (s) out.push([-7, f.a ? `the feud with the ${s === "a" ? f.b : f.a}s` : `the quarrel with ${s === "a" ? f.pb : f.pa}`]);
    else out.push([-2, f.a ? `the ${f.a}–${f.b} feud: fighting in the street` : `${f.pa} and ${f.pb} at each other's throats`]);
  }
  const worst = Object.entries(p.op || {}).sort((x, y) => x[1] - y[1])[0];
  if (worst && worst[1] <= -40 && !feudFor(S, p)) out.push([-3, `can't abide ${worst[0]}`]);
  const kin = S.people.filter(q => q !== p && q.family && q.family === p.family).length;
  if (kin) out.push([Math.min(5, 2 + kin), `family here (${kin} ${p.family}${kin > 1 ? "s" : ""})`]);
  return out;
}

// A shift for someone whose family is at feud: if one of the other lot is about, they go for them with their fists.
// The watch, where there is a jail and Policing, breaks it up and locks up whoever threw the first blow.
export async function feudShift(town, a, sleep, alive) {
  const S = town.S, p = a.settler; if (!p || p.child || p.jailedDay != null) return false;
  const f = feudFor(S, p) || feudsOf(S).find(x => !x.over && !x.a && (x.pa === p.name || x.pb === p.name));
  if (!f || Math.random() > 0.4) return false;
  const foes = foesOf(S, f, p).map(q => town.actors.find(x => x.settler === q && !x.dead && !x.gone && !x.inside && !x.knocked)).filter(Boolean);
  let foe = null, fd = 32;
  for (const o of foes) { const d = Math.hypot(o.pos.x - a.pos.x, o.pos.z - a.pos.z); if (d < fd) { fd = d; foe = o; } }
  if (!foe) return false;
  const q = foe.settler;
  a.doing = `going for ${fullName(q)} — the feud`;
  if (fd > 1.6) { await Promise.race([a.walkTo(foe.pos.x, foe.pos.z, 2.4), sleep(6)]); alive(); }
  if (foe.dead || Math.hypot(foe.pos.x - a.pos.x, foe.pos.z - a.pos.z) > 2.2) return true;
  f.brawls = (f.brawls || 0) + 1;
  if (f.brawls === 1 || Math.random() < 0.3) UI.hint(`${fullName(p)} has gone for ${fullName(q)} — a fight in the street!`, 4);
  UI.bark(p.name, ["You'll answer for it!", `That's for the ${q.family || "lot of you"}!`, "Come here!", "I've waited for this."][Math.floor(Math.random() * 4)], 2);
  // the watch: someone on the beat comes running and takes the one who started it
  const watch = town.knows && town.knows("policing") && town.has("jail") && town.actors.find(w => w.settler && w.settler.job === "watch" && !w.dead && !w.knocked && !w.settler.follow && w !== a && w !== foe);
  if (watch) watch.walkTo(a.pos.x + 1, a.pos.z + 1, 3).catch(() => {});
  // the fight: fists up, blows traded, each landing or not
  foe.faceTo(a.pos.x, a.pos.z); a.person.setPose("punch"); foe.person.setPose("punch");
  for (let round = 0; round < 6; round++) {
    alive();
    if (foe.dead || foe.knocked) break;
    const hitter = round % 2 ? foe : a, hit = round % 2 ? a : foe;
    hitter.faceTo(hit.pos.x, hit.pos.z); hitter.person.setPose("punch");
    await sleep(0.4); alive(); hitter.person.setPose("idle");
    if (Math.random() < 0.7) {
      AUDIO.punch && AUDIO.punch(hit.pos);
      if (Math.random() < 0.4) AUDIO.voice && AUDIO.voice("pain", { at: hit.pos, high: hit.settler.sex === "f" });
      hit.hp = (hit.hp ?? 50) - (7 + Math.random() * 7);
      if (hit.hp <= BEATEN) {
        // once someone is properly beaten: is that enough, or isn't it? Decided once.
        const lethal = Math.random() < 0.3 && f.a;
        if (lethal && town.killSettler) { f.deaths++; f.until += 2; town.killSettler(hit, "feud"); feudGrief(town, f, hit.settler); }
        else {
          hit.knocked = G.time + 14; hit.lying = true; hit.path = []; hit.yOff = 0.05; hit.hp = 50;
          town.setMark && town.setMark(hit.settler, "bitter", `beaten bloody by ${fullName(hitter.settler)} in the feud`);
          UI.hint(`${fullName(hit.settler)} is beaten bloody. ${hitter.settler.name} considers it settled — for today.`, 4);
          setTimeout(() => { if (!hit.dead) { hit.knocked = 0; hit.lying = false; hit.yOff = 0; } }, 14000);
        }
        break;
      }
    } else AUDIO.whoosh && AUDIO.whoosh(0.25, false);
    await sleep(0.35);
    // the watch arrives
    if (watch && Math.hypot(watch.pos.x - a.pos.x, watch.pos.z - a.pos.z) < 2.5) {
      UI.hint(`${watch.settler.name} of the watch pulls them apart, and takes ${p.name} to the jail.`, 5);
      UI.bark(watch.settler.name, "Enough! You'll cool your heels in the jail.", 3);
      p.jailedDay = town.day; town.setMark && town.setMark(p, "disgraced", "locked up for brawling in the feud");
      f.until = Math.max(town.day + 1, f.until - 1);
      break;
    }
  }
  a.person.setPose("idle"); if (!foe.dead) foe.person.setPose("idle");
  town.persist();
  await sleep(1.5);
  return true;
}
// a death in a feud: the dead one's kin will not forget it
function feudGrief(town, f, dead) {
  const S = town.S;
  for (const k of S.people) if (k.family === dead.family) for (const q of S.people) if (q.family && q.family !== dead.family && (q.family === f.a || q.family === f.b)) nudge(town, k, q, -30, `${dead.name}'s death in the feud`);
}

// what you can do about it: blood money out of the treasury, to make them shake hands
export function peaceOffer(town, p) {
  const S = town.S, f = feudFor(S, p) || feudsOf(S).find(x => !x.over && !x.a && (x.pa === p.name || x.pb === p.name));
  if (!f) return null;
  // (with a town hall, the council arbitrates: half the price)
  const cost = Math.ceil((8 + f.deaths * 14 + (f.brawls || 0) * 2) * (town.hallTier ? 0.5 : 1));
  const who = f.a ? `the ${f.a}s and the ${f.b}s` : `${f.pa} and ${f.pb}`;
  return { icon: "coin", label: `Make peace between ${who}`, note: `Blood money from the treasury, and both families made to shake hands at the fire.${f.deaths ? ` There's a grave between them: it costs dear, and they may still refuse.` : ""} It started ${f.why}.`, get: `${cost} DM`,
    can: () => (S.coin || 0) >= cost,
    do: () => {
      S.coin -= cost;
      if (f.deaths && Math.random() < 0.35) { UI.bark(p.name, "Money? For a life? Keep it.", 4); f.until += 1; town.persist(); G.closeTrade && G.closeTrade(); return; }
      endFeud(town, f, "paid"); UI.bark(p.name, "...Very well. For the settlement's sake.", 3); G.closeTrade && G.closeTrade();
    } };
}
