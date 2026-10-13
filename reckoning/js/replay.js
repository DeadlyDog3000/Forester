// ===========================================================================
//  FORESTER: RECKONING — Copyright (c) 2026 Roan Fraese / DeadlyDog Productions
// ===========================================================================

// THE BATTLE, AS IT WAS. Every fight of To Arms is written down as it's fought — where every man stood a tenth of a
// second at a time, what he held and how, every shot, every gun, every grenade, every man down — and can be played
// over again afterwards: the whole of it, from any moment and from anywhere on the field, or cut down to its
// highlights. The game that fought it keeps the last few, and sends each to the server, where anyone can watch the
// battles fought lately, or a commander's best.
//
// A recording: { v, meta, setup, roster, frames, ev, hl }
//   setup   the ground and the field, enough to build them again exactly (see buildStage in pvp.js)
//   roster  every body on it: an id (you -1, the other player -2), the side, the name, the look, the arms, the gun
//   frames  [t, entries, guns]: entries [id, x, z, yaw] (in tenths of a metre from the field's middle, and hundredths
//           of a radian), with [flags, pose, held, loading] after them when any of those changed; only the men who
//           moved or changed since the last; guns [yaw, pitch, loaded, readiness] when any changed
//   ev      [kind, t, ...]: s a shot, a an arrow, g a gun, n a grenade, d a man down, r up again, x gone, h hurt,
//           p a blow turned, F forward, R a round begun, W a round won, E the end
//   hl      the highlights: [{ t0, t1, kind, cap, sub, ids, at, slow, score }]

import { THREE, camera } from "./core.js";
import { G } from "./engine.js";
import { post } from "./post.js";
import { UI } from "./ui.js";
import { AUDIO } from "./audio.js";
import { clearGore } from "./gore.js";
import { clearDropped } from "./ragdoll.js";
import { blowLands } from "./fight.js";
import { isF } from "./mp/look.js";
import { globalServer, addressOf, myToken } from "./mp/net.js";
import { buildStage, makePuppet } from "./pvp.js";

const $ = id => document.getElementById(id);
const esc = s => String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const r2 = v => Math.round(v * 100) / 100, r3 = v => Math.round(v * 1000) / 1000;
const SNAP = 0.1, MAX_SECS = 20 * 60;
const ME = -1, THEM = -2;

// ---------------------------------------------------------------------------
//  writing it down, as it's fought
// ---------------------------------------------------------------------------
export class Recorder {
  constructor(A, setup) {
    this.A = A; this.setup = setup; this.t = 0; this.on = false;
    this.frames = []; this.ev = []; this.roster = []; this.bodies = [];
    this.last = new Map(); this.dead = new Set(); this.gone = new Set(); this.gunsLast = "";
    this.snapT = 0; this.ids = new Map(); this.nextId = 0;
  }
  // (the clock starts as the countdown does: the opening shown before it isn't part of the battle)
  begin() {
    if (this.on || this.ended) return; this.on = true;
    this.cast();
  }
  cast() {
    const A = this.A;
    const add = (b, id, extra) => { if (!b || this.ids.has(b)) return; this.ids.set(b, id); if (b.a) this.ids.set(b.a, id); this.bodies.push({ b, id }); this.roster.push({ id, ...extra }); };
    add(A.you, ME, { team: 0, name: A.me.name, look: A.myLook || A.me.look, lo: { ...A.lo }, you: 1 });
    if (A.netFoe) add(A.netFoe, THEM, { team: 1, name: A.netFoe.info.name, look: A.netFoe.info.look, lo: A.netFoe.info.lo || { long: "musket", side: "none", blade: "dagger" }, them: 1 });
    // (the duel's one foe has no number of its own: given one)
    for (const u of A.units) {
      if (this.ids.has(u)) continue;
      let id = u.uid; if (id == null || id < 0) { while ([...this.ids.values()].includes(this.nextId)) this.nextId++; id = this.nextId++; }
      const g = u.crewOf && A.field ? A.field.guns.indexOf(u.crewOf) : -1;
      add(u, id, { team: u.team ?? 1, name: u.info.name, look: u.info.look, lo: u.lo || u.info.lo, gun: g, ci: u.crewIdx | 0, them: !A.multi && u === A.foe ? 1 : undefined });
    }
  }
  idOf(x) { if (x == null) return ME; return this.ids.has(x) ? this.ids.get(x) : null; }
  push(k, ...a) { if (this.on && !this.ended) this.ev.push([k, r2(this.t), ...a]); }
  rel(v) { const S = this.setup; return [r2(v.x - S.x), r2(v.y), r2(v.z - S.z)]; }
  // ---- what happens: told by the battle as it happens ----
  shot(npc, from, dir, pistol) { const id = this.idOf(npc); if (id != null) this.push("s", id, pistol ? 1 : 0, ...this.rel(from), r3(dir.x), r3(dir.y), r3(dir.z)); }
  arrow(npc, from, dir, power, bolt) { const id = this.idOf(npc); if (id != null) this.push("a", id, bolt ? 1 : 0, r2(power), ...this.rel(from), r3(dir.x), r3(dir.y), r3(dir.z)); }
  gun(i) { this.push("g", i); }
  nade(from, v, fuse) { this.push("n", ...this.rel(from), r2(v.x), r2(v.y), r2(v.z), r2(fuse)); }
  hurt(b) { const id = this.idOf(b); if (id != null) this.push("h", id); }
  parried(b) { const id = this.idOf(b); if (id != null) this.push("p", id); }
  down(b, { from, head, blast, yours, quiet } = {}) {
    const id = this.idOf(b); if (id == null || this.dead.has(id)) return;
    this.dead.add(id);
    const S = this.setup, p = b.pos || b.a.pos, f = from || p;
    this.push("d", id, Math.round((p.x - S.x) * 10), Math.round((p.z - S.z) * 10), Math.round((f.x - S.x) * 10), Math.round((f.z - S.z) * 10), (head ? 1 : 0) | (blast ? 2 : 0) | (yours ? 4 : 0) | (quiet ? 8 : 0));
  }
  // ---- where everyone is: a tenth of a second at a time ----
  tick(dt) {
    if (!this.on || this.ended) return;
    this.t += dt;
    if (this.t > MAX_SECS || (this.snapT -= dt) > 0) return;
    this.snapT = SNAP;
    const A = this.A, S = this.setup, present = new Set(A.units), out = [];
    for (const { b, id } of this.bodies) {
      const you = id === ME, alive = !!b.alive;
      // (up again — a new round, or in a comrade's place)
      if (alive && this.dead.has(id)) { this.dead.delete(id); this.push("r", id); this.last.delete(id); }
      if (!alive) { if (!this.dead.has(id) && (you || present.has(b) || b === A.netFoe)) this.down(b, {}); continue; }
      // (gone from the field without falling: a man whose place another player took)
      if (!you && b !== A.netFoe && (!present.has(b) || (b.a && b.a.root.visible === false))) { if (!this.gone.has(id)) { this.gone.add(id); this.push("x", id); } continue; }
      if (this.gone.has(id)) { this.gone.delete(id); this.push("r", id); }
      const s = you ? this.mine() : this.theirs(b);
      const e = [id, Math.round((s[0] - S.x) * 10), Math.round((s[1] - S.z) * 10), Math.round(Math.atan2(Math.sin(s[2]), Math.cos(s[2])) * 100)];
      const extra = [s[3], s[4], s[5], s[6]], L = this.last.get(id);
      const moved = !L || L[1] !== e[1] || L[2] !== e[2] || L[3] !== e[3], changed = !L || L[4] !== extra[0] || L[5] !== extra[1] || L[6] !== extra[2] || L[7] !== extra[3];
      if (!moved && !changed) continue;
      this.last.set(id, [...e, ...extra]);
      out.push(changed ? [...e, ...extra] : e);
    }
    let g = 0;
    if (A.field && A.field.guns.length) {
      const gs = A.field.guns.map(q => [Math.round(q.yaw * 100), Math.round(q.pitch * 100), q.loaded ? 1 : 0, Math.round(clamp(1 - q.reload / (q.reloadT || 1), 0, 1) * 10)]), k = JSON.stringify(gs);
      if (k !== this.gunsLast) { this.gunsLast = k; g = gs; }
    }
    if (out.length || g) this.frames.push(g ? [r2(this.t), out, g] : [r2(this.t), out]);
  }
  // you: as the other player's game is told you are (see sendState in pvp.js)
  mine() {
    const pl = G.player, A = this.A;
    const held = pl.gun ? pl.gunIs : pl.bow ? "bow" : pl.xbow ? "crossbow" : pl.axe ? (pl.bayonet ? "bayonet" : A.lo.blade) : "";
    const aim = (pl.gun && pl.gunAim > 0.5) || (pl.bow && pl.draw > 0.1) || (pl.xbow && pl.xaim > 0.5);
    const swing = pl.swingT >= 0 ? (pl.swingDir === "up" ? "overhead" : "slash") : null;
    const pose = swing || (aim && held === "bow" ? "reach" : pl.guard ? "guard" : "idle");
    const ld = pl.gun && pl.gunReload > 0 ? r2((pl.gunIs === "pistol" ? 2.4 : 6.5) - pl.gunReload) : 0;
    const fl = (aim && held !== "bow" ? 2 : 0) | (pl.crouched ? 4 : 0);
    return [pl.pos.x, pl.pos.z, pl.yaw + Math.PI, fl, pose, held, Math.round(ld * 10) / 10];
  }
  theirs(u) {
    const P = u.a.person, D = { up: 0, left: 1, right: 2 };
    const fl = (P.aimWant ? 2 : 0) | (P.crouching ? 4 : 0) | (u.wind > 0 ? 8 : 0) | ((D[u.dir] | 0) << 5);
    return [u.pos.x, u.pos.z, u.a.yaw, fl, P.pose || "idle", u.heldK || "", P.load ? Math.round(P.load.e * 10) / 10 : 0];
  }
  // ---- done: the whole of it, with its highlights picked out ----
  finish(meta) {
    if (this.ended) return this.rec; this.ended = true;
    if (!this.on || this.t < 4 || !this.frames.length) return null;
    const rec = { v: 1, at: Date.now(), meta: { ...meta, secs: Math.round(this.t) }, setup: this.setup, roster: this.roster, frames: this.frames, ev: this.ev };
    rec.hl = highlights(rec);
    rec.meta.hl = rec.hl.length; rec.meta.score = Math.round(rec.hl.reduce((s, h) => s + h.score, 0));
    return this.rec = rec;
  }
}

// ---------------------------------------------------------------------------
//  reading it back
// ---------------------------------------------------------------------------
// the frames as whole states: every entry with its flags and pose, at the field's own coordinates
function decode(rec) {
  if (rec._d) return rec._d;
  const S = rec.setup, st = new Map();
  const frames = rec.frames.map(f => {
    const u = [];
    for (const e of f[1]) {
      const id = e[0], old = st.get(id);
      const ex = e.length > 4 ? [e[4], e[5], e[6], e[7]] : old ? old.slice(4) : [0, "idle", "", 0];
      const s = [id, e[1] / 10 + S.x, e[2] / 10 + S.z, e[3] / 100, ...ex];
      st.set(id, s); u.push(s);
    }
    return { t: f[0], u, g: f[2] || null };
  });
  const ev = rec.ev.map(e => ({ k: e[0], t: e[1], a: e.slice(2) }));
  const dur = Math.max(frames.length ? frames[frames.length - 1].t : 0, ev.length ? ev[ev.length - 1].t : 0) + 1.5;
  const names = new Map(rec.roster.map(r => [r.id, r]));
  return rec._d = { frames, ev, dur, names };
}
// where a man was at a moment (the last entry for him at or before it)
function posAt(d, id, t) {
  let p = null;
  for (const f of d.frames) { if (f.t > t) break; for (const e of f.u) if (e[0] === id) p = e; }
  return p ? { x: p[1], z: p[2], yaw: p[3] } : null;
}

// ---------------------------------------------------------------------------
//  the highlights: the moments worth seeing again, and how long to give each
// ---------------------------------------------------------------------------
const SLOW = 0.35;
export function highlights(rec) {
  const d = decode(rec), S = rec.setup, R = d.names, out = [];
  const team = id => (R.get(id) || {}).team ?? 1;
  const who = id => { const r = R.get(id); if (!r) return "a man"; if (r.you) return "you"; return String(r.name || "").split(" — ")[0] || r.name; };
  const downs = d.ev.filter(e => e.k === "d").map(e => ({ t: e.t, id: e.a[0], x: e.a[1] / 10 + S.x, z: e.a[2] / 10 + S.z, fx: e.a[3] / 10 + S.x, fz: e.a[4] / 10 + S.z, head: !!(e.a[5] & 1), blast: !!(e.a[5] & 2), yours: !!(e.a[5] & 4) }));
  const shots = d.ev.filter(e => e.k === "s" || e.k === "a");
  const add = (h) => out.push({ slow: null, ...h });
  const fwd = d.ev.find(e => e.k === "F");
  const battle = !!S.battle, duel = !S.multi;
  // the opening: the drums, and the lines moving off
  if (fwd && battle) add({ t0: Math.max(0, fwd.t - 1.2), t1: fwd.t + 4.5, kind: "open", cap: "Forward", sub: "", score: 3, must: true });
  // your kills
  for (const k of downs.filter(k => k.yours && k.id !== ME)) {
    const shotBy = shots.some(e => e.a[0] === ME && e.t <= k.t && e.t > k.t - 1.6);
    const how = k.blast ? "The gun you laid" : k.head ? "Through the head" : shotBy ? "Your shot" : "With the steel";
    add({ t0: k.t - (shotBy ? 3 : 3.4), t1: k.t + 2.2, kind: "kill", ids: [ME, k.id], at: k, cap: how, sub: who(k.id), slow: [k.t - (shotBy ? 0.9 : 0.6), k.t + 0.7], score: 6 + (k.head ? 3 : 0) + (shotBy ? 0 : 2) + (k.blast ? 2 : 0) });
  }
  // you, falling
  for (const k of downs.filter(k => k.id === ME)) add({ t0: k.t - 3.2, t1: k.t + 2.8, kind: "death", ids: [ME], at: k, cap: "You fell", sub: battle ? "" : "", slow: [k.t - 0.7, k.t + 1.4], score: 9, must: true });
  // the other player falling (a battle against a player: their man, not just any)
  for (const k of downs.filter(k => k.id === THEM && !k.yours)) add({ t0: k.t - 2.6, t1: k.t + 2.2, kind: "death", ids: [THEM], at: k, cap: `${who(THEM)} falls`, sub: "", slow: [k.t - 0.5, k.t + 1], score: 7 });
  // the guns: a shot that tells
  for (const g of d.ev.filter(e => e.k === "g")) {
    const hit = downs.filter(k => k.blast && k.t > g.t && k.t < g.t + 2.6);
    if (!hit.length) continue;
    const gt = R.size ? null : null; void gt;
    add({ t0: g.t - 1.6, t1: g.t + 3.4, kind: "gun", gun: g.a[0], at: hit[0], cap: "The guns", sub: `${hit.length} down`, slow: [g.t + 0.3, g.t + 1.6], score: 3 + hit.length * 1.6 });
  }
  // grenades that tell
  for (const n of d.ev.filter(e => e.k === "n")) {
    const at = { x: n.a[0] + S.x, z: n.a[2] + S.z }, fuse = n.a[6] || 2, bt = n.t + fuse;
    const hit = downs.filter(k => k.blast && Math.abs(k.t - bt) < 0.6 && Math.hypot(k.x - at.x, k.z - at.z) < 14);
    if (!hit.length) continue;
    add({ t0: n.t - 1.2, t1: bt + 2.6, kind: "blast", at: hit[0], cap: "A grenade", sub: `${hit.length} down`, slow: [bt - 0.3, bt + 1], score: 3 + hit.length * 1.8 });
  }
  // volleys: a side firing together, and what it did
  if (S.multi) {
    const used = new Set();
    for (let i = 0; i < shots.length; i++) {
      if (used.has(i)) continue;
      const s0 = shots[i], side = team(s0.a[0]), group = [];
      for (let j = i; j < shots.length && shots[j].t < s0.t + 1.8; j++) if (team(shots[j].a[0]) === side && shots[j].k === "s") group.push(j);
      if (group.length < 5) continue;
      group.forEach(j => used.add(j));
      const t = shots[group[0]].t, fell = downs.filter(k => team(k.id) !== side && k.t > t && k.t < t + 3);
      const off = group.map(j => shots[j]), cx = off.reduce((a, e) => a + e.a[2], 0) / off.length + S.x, cz = off.reduce((a, e) => a + e.a[4], 0) / off.length + S.z;
      add({ t0: t - 1.4, t1: t + 3.6, kind: "volley", side, at: { x: cx, z: cz }, ids: off.map(e => e.a[0]), cap: side === 0 ? "Your company's volley" : "Their volley", sub: fell.length ? `${fell.length} down` : "", slow: [t - 0.1, t + 1.2], score: 2.5 + fell.length * 1.4 });
    }
    // the lines meeting: the first moment the two sides are at each other with the steel, man to man, in numbers
    let met = null;
    for (const f of d.frames) {
      if (met || f.t < (fwd ? fwd.t : 0) + 3) continue;
      if (Math.round(f.t * 10) % 5) continue;
      const pos = posAll(d, f.t), list = [...pos.entries()].filter(([id]) => !downs.some(k => k.id === id && k.t <= f.t));
      let pairs = 0, cx = 0, cz = 0;
      for (const [a, p] of list) for (const [b, q] of list) if (a < b && team(a) !== team(b) && Math.abs(p.x - q.x) < 2.6 && Math.abs(p.z - q.z) < 2.6) { pairs++; cx += (p.x + q.x) / 2; cz += (p.z + q.z) / 2; }
      if (pairs >= 3) met = { t: f.t, x: cx / pairs, z: cz / pairs };
    }
    if (met) add({ t0: met.t - 2.2, t1: met.t + 4.2, kind: "clash", at: met, cap: "The lines meet", sub: "", slow: [met.t - 0.2, met.t + 1.6], score: 6 });
    // a man or two cut down in a moment, anywhere: worth a look if nothing else covers it
    for (let i = 0; i < downs.length; i++) {
      const k = downs[i], near = downs.filter(o => o.t >= k.t && o.t < k.t + 2.4 && Math.hypot(o.x - k.x, o.z - k.z) < 10);
      if (near.length >= 3) add({ t0: k.t - 2.2, t1: k.t + 3, kind: "blast", at: k, cap: "Cut down together", sub: `${near.length} in a moment`, slow: [k.t - 0.3, k.t + 1], score: 2 + near.length });
    }
  }
  // the duel's rounds: each one's last blow
  if (duel) for (const k of downs) add({ t0: k.t - 3.2, t1: k.t + 2.6, kind: k.id === ME ? "death" : "kill", ids: k.id === ME ? [ME] : [ME, k.id], at: k, cap: k.id === ME ? "You fell" : k.head ? "Through the head" : "The round is yours", sub: k.id === ME ? "" : who(k.id), slow: [k.t - 0.7, k.t + 1.1], score: 8, must: true });
  // the end: the last man down
  const end = d.ev.find(e => e.k === "E"), last = downs[downs.length - 1];
  if (last && S.multi) {
    const won = end ? !!end.a[0] : team(last.id) === 1;
    add({ t0: last.t - 3, t1: last.t + 4.5, kind: "final", ids: [last.id], at: last, cap: won ? "The field is yours" : "The day is lost", sub: won ? "The last of them down" : "The last of yours down", slow: [last.t - 0.5, last.t + 1.2], score: 10, must: true });
  }
  // chosen: the musts, then the best of the rest, as long as the reel stays under a minute or so — then in order,
  // and any two that overlap made one
  const len = h => (h.t1 - h.t0) + (h.slow ? (h.slow[1] - h.slow[0]) * (1 / SLOW - 1) : 0);
  for (const h of out) { h.t0 = Math.max(0, h.t0); h.t1 = Math.min(d.dur, h.t1); }
  const pick = [], over = (a, b) => Math.min(a.t1, b.t1) - Math.max(a.t0, b.t0);
  let total = 0;
  for (const h of out.sort((a, b) => (b.must ? 100 : 0) + b.score - (a.must ? 100 : 0) - a.score)) {
    if (h.t1 - h.t0 < 1) continue;
    const clash = pick.find(p => over(p, h) > Math.min(p.t1 - p.t0, h.t1 - h.t0) * 0.35);
    if (clash) { if (h.must && !clash.must) { pick.splice(pick.indexOf(clash), 1); total -= len(clash); } else continue; }
    if (total + len(h) > 62 && !h.must) continue;
    pick.push(h); total += len(h);
  }
  pick.sort((a, b) => a.t0 - b.t0);
  for (let i = 1; i < pick.length; i++) if (pick[i].t0 < pick[i - 1].t1) pick[i].t0 = pick[i - 1].t1;
  return pick.filter(h => h.t1 - h.t0 > 0.8).map(h => { const o = { ...h, score: Math.round(h.score * 10) / 10 }; delete o.must; if (o.at) o.at = { x: r2(o.at.x), z: r2(o.at.z) }; return o; });
}
// everyone's place at a moment (for the reel's own reckoning; not for drawing)
function posAll(d, t) {
  const c = d._posCache ||= { i: 0, m: new Map() };
  if (c.t != null && t < c.t) { c.i = 0; c.m = new Map(); }
  for (; c.i < d.frames.length && d.frames[c.i].t <= t; c.i++) for (const e of d.frames[c.i].u) c.m.set(e[0], { x: e[1], z: e[2] });
  c.t = t; return c.m;
}

// ---------------------------------------------------------------------------
//  sent to the server, kept here, fetched
// ---------------------------------------------------------------------------
const httpOf = () => { const g = globalServer(), a = g && addressOf(g); return a ? a.http : null; };
export async function packed(rec) {
  const clean = { ...rec }; delete clean._d;
  const s = new Blob([JSON.stringify(clean)]).stream().pipeThrough(new CompressionStream("gzip"));
  return await new Response(s).blob();
}
export async function upload(rec) {
  const h = httpOf(); if (!h || !rec || !window.CompressionStream) return null;
  try {
    const body = await packed(rec);
    const r = await fetch(h + "/replays", { method: "POST", headers: { "Content-Type": "application/octet-stream", "X-Token": myToken() }, body });
    const j = await r.json(); return j && j.ok ? j.id : null;
  } catch (e) { return null; }
}
export async function listReplays({ sort = "recent", pid = "", n = 20 } = {}) {
  const h = httpOf(); if (!h) return [];
  const ac = new AbortController(), to = setTimeout(() => ac.abort(), 4000);
  try { const r = await fetch(`${h}/replays?sort=${sort}&n=${n}${pid ? "&pid=" + encodeURIComponent(pid) : ""}`, { signal: ac.signal, cache: "no-store" }); const j = await r.json(); return j && j.list || []; }
  catch (e) { return []; } finally { clearTimeout(to); }
}
const fetched = new Map();
export async function fetchReplay(id) {
  if (fetched.has(id)) return fetched.get(id);
  const h = httpOf(); if (!h) return null;
  try { const r = await fetch(`${h}/replays/${id}`); if (!r.ok) return null; const rec = await r.json(); if (!rec || rec.v !== 1) return null; rec.id = id; fetched.set(id, rec); if (fetched.size > 8) fetched.delete(fetched.keys().next().value); return rec; }
  catch (e) { return null; }
}
// (your own last dozen, on this computer: watched as often as you like, server or no server)
const DB = "reckoning-replays";
function db() {
  return new Promise((ok, no) => { try { const r = indexedDB.open(DB, 1); r.onupgradeneeded = () => r.result.createObjectStore("mine", { keyPath: "key" }); r.onsuccess = () => ok(r.result); r.onerror = () => no(r.error); } catch (e) { no(e); } });
}
export async function keepMine(rec) {
  try {
    const d = await db(), key = rec.key || (rec.key = `${rec.at}-${Math.random().toString(36).slice(2, 7)}`);
    const clean = { ...rec }; delete clean._d;
    await new Promise((ok, no) => { const tx = d.transaction("mine", "readwrite"); tx.objectStore("mine").put(clean); tx.oncomplete = ok; tx.onerror = () => no(tx.error); });
    // (only the last dozen)
    const all = await mineList(); for (const o of all.slice(12)) await new Promise(ok => { const tx = d.transaction("mine", "readwrite"); tx.objectStore("mine").delete(o.key); tx.oncomplete = ok; tx.onerror = ok; });
  } catch (e) {}
}
export async function mineList() {
  try {
    const d = await db();
    const all = await new Promise((ok, no) => { const tx = d.transaction("mine", "readonly"), r = tx.objectStore("mine").getAll(); r.onsuccess = () => ok(r.result || []); r.onerror = () => no(r.error); });
    return all.sort((a, b) => b.at - a.at);
  } catch (e) { return []; }
}
export function shareOn() { try { return localStorage.getItem("reckoning.replays.share") !== "0"; } catch (e) { return true; } }
export function setShare(on) { try { localStorage.setItem("reckoning.replays.share", on ? "1" : "0"); } catch (e) {} }
export function ambientOn() { try { return localStorage.getItem("reckoning.replays.ambient") !== "0"; } catch (e) { return true; } }
export function setAmbient(on) { try { localStorage.setItem("reckoning.replays.ambient", on ? "1" : "0"); } catch (e) {} }

// how long ago, in words
export function ago(at) {
  const s = Math.max(0, (Date.now() - at) / 1000);
  return s < 90 ? "just now" : s < 3600 ? `${Math.round(s / 60)} min ago` : s < 86400 * 1.5 ? `${Math.round(s / 3600)} h ago` : `${Math.round(s / 86400)} days ago`;
}
export const mmss = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
// a recording's title, and the line under it
export function titleOf(r) {
  const m = r.meta || r, kind = m.kind === "duel" ? "Duel" : m.kind === "skirmish" ? "Skirmish" : "Battle";
  return { t: `${kind}${m.place ? ` ${/^(near|far)/i.test(m.place) ? m.place.replace(/^N/, "n").replace(/^F/, "f") : "· " + m.place}` : ""}`, s: `${m.name || "Someone"} against ${m.foe || "bots"}` };
}

// ---------------------------------------------------------------------------
//  the film: bars top and bottom, a title and a line in them, a dip to black between shots
// ---------------------------------------------------------------------------
export const FILM = {
  el() {
    let f = $("film");
    if (!f) { f = document.createElement("div"); f.id = "film"; f.innerHTML = `<div class="fm-bar fm-top"><div class="fm-note"></div></div><div class="fm-bar fm-bot"></div><div class="fm-cap"><div class="fm-k"></div><div class="fm-t"></div><div class="fm-s"></div></div><div class="fm-dip"></div>`; document.body.appendChild(f); }
    return f;
  },
  bars(on) { const f = this.el(); f.classList.toggle("on", !!on); post.dof = on ? 0.85 : 0; },
  note(t) { this.el().querySelector(".fm-note").textContent = t || ""; },
  // a title over the film (k a small line above it); null to take it off
  cap(t, s = "", k = "", big = false) {
    const f = this.el(), c = f.querySelector(".fm-cap");
    if (t == null) { c.classList.remove("show"); return; }
    c.querySelector(".fm-k").textContent = k; c.querySelector(".fm-t").textContent = t; c.querySelector(".fm-s").textContent = s;
    c.classList.toggle("big", big); c.classList.remove("show"); void c.offsetWidth; c.classList.add("show");
  },
  dip(ms = 260) { const d = this.el().querySelector(".fm-dip"); d.style.transition = "none"; d.style.opacity = 1; void d.offsetWidth; d.style.transition = `opacity ${ms}ms ease`; d.style.opacity = 0; },
  off() { post.dof = 0; const f = $("film"); if (f) { f.classList.remove("on"); this.cap(null); this.note(""); } },
};

// ---- the camera's moves: put it somewhere, looking at something, smoothly ----
const _v = new THREE.Vector3(), _w = new THREE.Vector3();
export function aim(cam, from, to, fov = 50) {
  post.focus = Math.hypot(to.x - from.x, to.y - from.y, to.z - from.z);
  cam.position.set(from.x, from.y, from.z); cam.up.set(0, 1, 0); cam.lookAt(to.x, to.y, to.z);
  if (Math.abs(cam.fov - fov) > 0.05) { cam.fov = fov; cam.updateProjectionMatrix(); }
}
export const ease = t => t * t * (3 - 2 * t);
export const groundY = (x, z) => (G.world && G.world.heightAt ? G.world.heightAt(x, z) : 0);
// a camera that eases toward where it's told, so a shot following moving men doesn't shake with them
// (and that rises over whatever stands between it and what it's looking at — a wall, a gabion, a rise in the ground —
//  so a shot is never of the side of a basket of earth)
const _e = new THREE.Vector3();
function blocked(p, l, up) {
  const w = G.world; if (!w) return false;
  const dx = l.x - p.x, dy = l.y - p.y - up, dz = l.z - p.z, d = Math.hypot(dx, dy, dz), n = Math.ceil(d / 0.45);
  for (let i = 1; i < n - 3; i++) {
    const t = i / n, x = p.x + dx * t, y = p.y + up + dy * t, z = p.z + dz * t;
    if (y < groundY(x, z) + 0.05 || (w.col && w.col.solidAt(x, y, z, 0.05))) return true;
  }
  return false;
}
export class Smooth {
  constructor() { this.p = null; this.l = null; this.lift = 0; }
  go(cam, from, to, fov, k = 4, dt = 1 / 60) {
    const a = 1 - Math.exp(-k * dt);
    if (!this.p) { this.p = new THREE.Vector3(from.x, from.y, from.z); this.l = new THREE.Vector3(to.x, to.y, to.z); this.lift = -1; }
    else { this.p.lerp(_v.set(from.x, from.y, from.z), a); this.l.lerp(_w.set(to.x, to.y, to.z), a); }
    // (never under the ground)
    this.p.y = Math.max(this.p.y, groundY(this.p.x, this.p.z) + 0.5);
    // (only ever up, within a shot: risen over a gabion, it stays risen — coming down again as soon as the way looked
    //  clear set it bobbing over every basket it passed)
    let want = 0; while (want < 7 && blocked(this.p, this.l, want)) want += 0.6;
    if (this.lift < 0) this.lift = want; else if (want > this.lift) this.lift += (want - this.lift) * (1 - Math.exp(-3 * dt));
    _e.copy(this.p); _e.y += this.lift;
    aim(cam, _e, this.l, fov);
  }
  cut() { this.p = null; this.l = null; }
}

// ---------------------------------------------------------------------------
//  the theatre: a recording played back on the field it was fought on
// ---------------------------------------------------------------------------
// mode "highlights": the reel, cut and slowed and scored; "full": the whole battle, with the controls to go anywhere
// in it and see it from anywhere; "ambient": the reel, behind the menus, quiet and far off, one battle after another
let current = null;
export const theatre = () => current;
export class Theatre {
  constructor(rec, { mode = "highlights", onExit = null, onEnd = null, title = null, from = "camp" } = {}) {
    if (current) current.stop(true);
    current = this;
    this.tape = rec; this.mode = mode; this.onExit = onExit; this.onEnd = onEnd; this.title = title; this.from = from;
    this.d = decode(rec); this.S = rec.setup; this.dur = this.d.dur;
    this.t = 0; this.rate = 1; this.paused = false; this.fi = 0; this.ei = 0; this.gunState = null;
    this.cam = "auto"; this.sm = new Smooth(); this.free = null; this.keys = new Set();
    this.hl = rec.hl && rec.hl.length ? rec.hl : highlights(rec);
    this.build();
  }
  build() {
    const S = this.S;
    UI.fadeNow(1);
    G.theatre = this; G.arena = null;
    const st = this.stage = buildStage(S);
    this.w = st.w; this.field = st.field; this.hunt = st.hunt;
    this.battle = !!S.battle; this.multi = !!S.multi; this.live = false; this.net = null; this.over = true;
    this.bodies = new Map();
    for (const r of this.tape.roster) {
      const u = makePuppet(this, { name: r.name, look: r.look, lo: r.lo || { long: "musket", side: "none", blade: "dagger" }, team: r.team, idx: r.id, uid: r.id, bot: !r.you });
      if (r.gun >= 0 && this.field && this.field.guns[r.gun]) { const g = this.field.guns[r.gun]; u.crewOf = g; u.crewIdx = r.ci | 0; g.crew.push(u); }
      u.r = r; this.bodies.set(r.id, u);
      if (r.you) this.you = u;
    }
    if (!this.you) this.you = { pos: new THREE.Vector3(), alive: false };
    // (the player's own body out of it: you're the man in the recording now; the eye is the theatre's)
    const pl = G.player; pl.frozen = true; if (pl.model) pl.model.root.visible = false;
    G.lockMove = true; G.downed = false; G.showHealth = false; G.mode = "theatre";
    UI.show("hud", false);
    document.exitPointerLock && document.exitPointerLock();
    this.warp0 = G.timeWarp; G.timeWarp = dt => this.paused ? 0 : dt * this.rate;
    this.tickF = dt => this.tick(dt); G.onFrame.push(this.tickF);
    G.deathCam = (cam, dt) => this.camera(cam, dt);
    this.rt = performance.now();
    this.seek(0, true);
    if (this.mode === "ambient") AUDIO.hush(0.12); else AUDIO.hush(1);
    this.ui();
    if (this.mode === "full") this.startFull(); else this.startReel();
    UI.fade(0, 0.9);
  }
  // ---- playing ----
  tick(dt) {
    if (current !== this) return;
    if (!this.paused) {
      this.t = Math.min(this.dur, this.t + dt);
      this.play(this.t);
    }
    for (const u of this.bodies.values()) u.tick(dt);
    if (this.field) this.field.update(dt, [], () => {});
    // (the listener where the eye is: near men loud, far ones far — and the country drawn in full round it)
    const pl = G.player; pl.pos.x = camera.position.x; pl.pos.z = camera.position.z; pl.pos.y = groundY(pl.pos.x, pl.pos.z);
    if (this.reel) this.reelTick();
    else if (this.t >= this.dur && !this.paused && this.mode === "full") { this.paused = true; this.drawUi(true); }
    this.uiTick();
  }
  // everything that happened up to t, done
  play(t) {
    const F = this.d.frames, E = this.d.ev;
    for (; this.fi < F.length && F[this.fi].t <= t; this.fi++) {
      const f = F[this.fi];
      for (const e of f.u) { const u = this.bodies.get(e[0]); if (u && u.alive && !u.goneX) u.snap(e); }
      if (f.g) this.guns(f.g);
    }
    for (; this.ei < E.length && E[this.ei].t <= t; this.ei++) this.event(E[this.ei], true);
  }
  guns(g) { if (!this.field) return; g.forEach((v, i) => { const q = this.field.guns[i]; if (q) q.net = [v[0] / 100, v[1] / 100, v[2], v[3] / 10]; }); this.gunState = g; }
  abs(a, i) { return new THREE.Vector3(a[i] + this.S.x, a[i + 1], a[i + 2] + this.S.z); }
  // what happened: shown and heard as it was (live), or only its outcome (seeking past it)
  event(e, live) {
    const a = e.a, u = typeof a[0] === "number" ? this.bodies.get(a[0]) : null;
    switch (e.k) {
      case "s": {
        if (!live || !u) return;
        const f = this.abs(a, 2), dir = new THREE.Vector3(a[5], a[6], a[7]).normalize(), pis = !!a[1];
        AUDIO.gunshot && AUDIO.gunshot(pis ? 0.75 : 0.95, u.pos);
        G.gunSmoke && G.gunSmoke(f.clone().addScaledVector(dir, -0.4), dir, pis ? 0.6 : 1);
        this.hunt.fireBall(f, dir, { speed: pis ? 260 : 420, npc: u, ghost: true });
        this.lastAct = { x: f.x, z: f.z, t: e.t };
        return;
      }
      case "a": {
        if (!live || !u) return;
        const f = this.abs(a, 3), dir = new THREE.Vector3(a[6], a[7], a[8]).normalize();
        this.hunt.loose(f, dir, a[2] || 1, !!a[1], u.a, () => {});
        AUDIO.twang && AUDIO.twang(a[1] ? 1.2 : 0.8);
        return;
      }
      case "g": { const g = this.field && this.field.guns[a[0]]; if (g && live) { g.model.updateMatrixWorld(true); this.field.fire(g); this.lastAct = { x: g.x, z: g.z, t: e.t }; } return; }
      case "n": { if (live && this.field) this.field.nade(this.abs(a, 0), new THREE.Vector3(a[3], a[4], a[5]), 0, a[6] || 2); return; }
      case "h": { if (live && u && u.alive) { blowLands(u.a, "hit", { pos: u.pos }); u.a.person.flinch && u.a.person.flinch(); AUDIO.voice && AUDIO.voice(Math.random() < 0.7 ? "pain" : "grunt", { at: u.pos, high: isF(u.info.look) }); } return; }
      case "p": { if (live && u) AUDIO.clang && AUDIO.clang(0.9, u.pos); return; }
      case "F": { if (live && this.battle) AUDIO.drumRoll && AUDIO.drumRoll(1.8, 0.28); return; }
      case "d": {
        if (!u || !u.alive) return;
        const S = this.S, x = a[1] / 10 + S.x, z = a[2] / 10 + S.z, from = { x: a[3] / 10 + S.x, z: a[4] / 10 + S.z }, fl = a[5] | 0;
        u.hp = 0; u.quiet = !live || !!(fl & 8); u.blast = !!(fl & 2);
        u.a.place(x, z, u.a.yaw); u.tx = x; u.tz = z;
        u.fallDown(from, !!(fl & 1)); u.blast = false;
        if (!live && u.rag) for (let i = 0; i < 70; i++) u.rag.step(1 / 30);
        this.lastAct = { x, z, t: e.t };
        return;
      }
      case "r": { if (!u) return; u.goneX = false; u.a.root.visible = true; if (!u.alive) { u.hp = 100; u.standUp(); } return; }
      case "x": { if (!u) return; u.goneX = true; u.a.root.visible = false; return; }
    }
  }
  // to a moment: everyone as they were then — the fallen fallen, the rest in their places — and on from there
  seek(T, quiet = false) {
    T = clamp(T, 0, this.dur);
    clearGore(); clearDropped();
    for (const ar of this.hunt.arrows || []) { this.w.root.remove(ar.mesh); if (ar.it) this.w.removeInteract(ar.it); }
    this.hunt.arrows = [];
    if (this.field) { for (const b of this.field.balls) this.w.root.remove(b.mesh); this.field.balls.length = 0; for (const n of this.field.nades || []) this.w.root.remove(n.mesh, n.spark); if (this.field.nades) this.field.nades.length = 0; }
    for (const u of this.bodies.values()) { u.goneX = false; u.a.root.visible = true; u.hp = 100; u.quiet = false; u.standUp(); u.heldK = undefined; u.hold(u.crewOf ? null : u.lo.long !== "none" ? u.lo.long : u.lo.blade); }
    // (where each was, last told, by then)
    const st = new Map(); let gs = null;
    let fi = 0; for (; fi < this.d.frames.length && this.d.frames[fi].t <= T; fi++) { const f = this.d.frames[fi]; for (const e of f.u) st.set(e[0], e); if (f.g) gs = f.g; }
    if (gs) this.guns(gs);
    for (const [id, e] of st) { const u = this.bodies.get(id); if (!u) continue; u.a.place(e[1], e[2], e[3]); u.tx = e[1]; u.tz = e[2]; u.tyaw = e[3]; u.snap(e); u.spd = 0; }
    // (the outcomes: who'd fallen, who'd gone, who was up again)
    let ei = 0; for (; ei < this.d.ev.length && this.d.ev[ei].t <= T; ei++) { const e = this.d.ev[ei]; if ("drx".includes(e.k)) this.event(e, false); }
    this.fi = fi; this.ei = ei; this.t = T;
    if (!quiet) this.sm.cut();
  }
  // ---- the reel ----
  startReel() {
    this.reel = { i: -1 };
    const m = this.tape.meta || {};
    if (this.mode !== "ambient") { FILM.bars(true); FILM.note("Replay"); }
    if (this.mode !== "ambient") AUDIO.score(18, { vol: 0.7 });
    if (!this.hl.length) { this.reel = null; this.startFull(); return; }
    this.reel.card = this.title || titleOf(this.tape);
    this.nextClip();
    void m;
  }
  nextClip() {
    const R = this.reel; R.i++;
    if (R.i >= this.hl.length) return this.reelDone();
    const h = R.h = this.hl[R.i];
    if (h.t0 < this.t - 0.05 || h.t0 > this.t + 1.2) { FILM.dip(320); this.seek(h.t0); }
    R.shot = h.kind; R.u0 = this.t; this.sm.cut(); R.a0 = Math.random() * Math.PI * 2;
    const k = R.i === 0 ? titleOf(this.tape).t : "";
    if (this.mode === "ambient") return;
    FILM.cap(h.cap, h.sub || "", k, R.i === 0);
    clearTimeout(R.capT); R.capT = setTimeout(() => current === this && FILM.cap(null), 3200);
  }
  reelTick() {
    const R = this.reel, h = R.h; if (!h) return;
    // (slow, about the moment itself)
    const inSlow = h.slow && this.t >= h.slow[0] && this.t <= h.slow[1];
    const want = inSlow ? SLOW : 1; this.rate += (want - this.rate) * 0.15;
    if (this.t >= h.t1 || this.t >= this.dur - 0.05) this.nextClip();
  }
  reelDone() {
    const R = this.reel; R.h = null; this.rate = 1; this.paused = true;
    const m = this.tape.meta || {};
    if (this.mode === "ambient") { if (this.onEnd) this.onEnd(this); return; }
    FILM.cap(m.won ? "Victory" : "Defeat", `${m.k | 0} of theirs down · ${m.l | 0} of yours`, titleOf(this.tape).t, true);
    AUDIO.scoreOff(4);
    this.drawUi(true);
    if (this.onEnd) this.onEnd(this);
  }
  // ---- the whole of it ----
  startFull() {
    this.reel = null; this.rate = 1; this.paused = false; this.mode = this.mode === "ambient" ? "ambient" : "full";
    FILM.bars(false); FILM.cap(null); AUDIO.scoreOff(1.5);
    if (this.t >= this.dur - 0.5) this.seek(0);
    this.drawUi(true);
  }
  // ---- the eye ----
  camera(cam, dt) {
    const now = performance.now(), rdt = Math.min(0.1, (now - this.rt) / 1000); this.rt = now;
    const S = this.S, sm = this.sm;
    if (this.reel && this.reel.h) return this.shot(cam, rdt);
    if (this.cam === "free") return this.freeCam(cam, rdt);
    const alive = [...this.bodies.values()].filter(u => u.alive && !u.goneX);
    const cen = l => l.length ? { x: l.reduce((s, u) => s + u.pos.x, 0) / l.length, z: l.reduce((s, u) => s + u.pos.z, 0) / l.length } : { x: S.x, z: S.z };
    if (this.cam === "you") {
      const y = this.you;
      if (y && y.pos) {
        const yaw = y.a ? y.a.yaw : 0, p = y.pos;
        if (y.alive) return sm.go(cam, { x: p.x - Math.sin(yaw) * 4.2, y: p.y + 2.3, z: p.z - Math.cos(yaw) * 4.2 }, { x: p.x + Math.sin(yaw) * 6, y: p.y + 1.2, z: p.z + Math.cos(yaw) * 6 }, 55, 5, rdt);
        const a = (this.t * 0.15) % (Math.PI * 2); return sm.go(cam, { x: p.x + Math.cos(a) * 4, y: p.y + 2.2, z: p.z + Math.sin(a) * 4 }, { x: p.x, y: p.y + 0.4, z: p.z }, 50, 3, rdt);
      }
    }
    if (this.cam === "top") {
      const c = cen(alive), gy = groundY(c.x, c.z);
      return sm.go(cam, { x: c.x + 0.01, y: gy + 62, z: c.z + 24 }, { x: c.x, y: gy, z: c.z }, 50, 2, rdt);
    }
    // the director: round where the action is, the angle turning slowly, now high, now low
    const act = this.lastAct && this.t - this.lastAct.t < 4 ? this.lastAct : null, c0 = cen(alive);
    const fx = act ? c0.x * 0.4 + act.x * 0.6 : c0.x, fz = act ? c0.z * 0.4 + act.z * 0.6 : c0.z;
    this.dirA = (this.dirA ?? 0.6) + rdt * 0.07; const hh = 6 + Math.sin(this.dirA * 0.7) * 3.5, R = 20 + Math.cos(this.dirA * 0.5) * 6;
    const gy = groundY(fx, fz);
    return sm.go(cam, { x: fx + Math.cos(this.dirA) * R, y: gy + hh, z: fz + Math.sin(this.dirA) * R }, { x: fx, y: gy + 1.2, z: fz }, 48, 1.6, rdt);
  }
  // a highlight's shot, by its kind
  shot(cam, rdt) {
    const R = this.reel, h = R.h, sm = this.sm, S = this.S, u = clamp((this.t - h.t0) / Math.max(0.1, h.t1 - h.t0), 0, 1);
    const B = id => this.bodies.get(id), P = (x, z, up) => ({ x, y: groundY(x, z) + up, z });
    const at = h.at || { x: S.x, z: S.z };
    switch (h.kind) {
      case "open": {
        const l0 = [...this.bodies.values()].filter(b => b.r.team === 0), l1 = [...this.bodies.values()].filter(b => b.r.team === 1);
        const c = l => ({ x: l.reduce((s, b) => s + b.pos.x, 0) / (l.length || 1), z: l.reduce((s, b) => s + b.pos.z, 0) / (l.length || 1) });
        const a = c(l0), b = c(l1), dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz) || 1, f = [dx / d, dz / d], r = [dz / d, -dx / d];
        // behind your line, low, as it steps off
        const o = (u - 0.5) * 10;
        return sm.go(cam, P(a.x - f[0] * 9 + r[0] * o, a.z - f[1] * 9 + r[1] * o, 1.6), P(a.x + f[0] * 14, a.z + f[1] * 14, 1.4), 50, 3, rdt);
      }
      case "kill": {
        const me = B(h.ids[0]), v = B(h.ids[1]); if (!me || !v) break;
        const dx = v.pos.x - me.pos.x, dz = v.pos.z - me.pos.z, d = Math.hypot(dx, dz) || 1, f = [dx / d, dz / d], r = [f[1], -f[0]];
        // (close: over your shoulder at him; far: from beside, to see both)
        if (d < 30) { const back = 1.7 + (1 - u) * 0.8; return sm.go(cam, P(me.pos.x - f[0] * back + r[0] * 0.6, me.pos.z - f[1] * back + r[1] * 0.6, 1.75), { x: v.pos.x, y: groundY(v.pos.x, v.pos.z) + 1.1, z: v.pos.z }, d < 8 ? 52 : 40 - Math.min(14, d * 0.4), 5, rdt); }
        const m = { x: (me.pos.x + v.pos.x) / 2, z: (me.pos.z + v.pos.z) / 2 };
        return sm.go(cam, P(m.x + r[0] * d * 0.55, m.z + r[1] * d * 0.55, 3), P(m.x, m.z, 1.2), 50, 3, rdt);
      }
      case "death": {
        const v = B(h.ids[0]); if (!v) break;
        const a = R.a0 + u * 0.9, rr = 3.6 - u * 0.6;
        return sm.go(cam, P(v.pos.x + Math.cos(a) * rr, v.pos.z + Math.sin(a) * rr, 1.5 + u * 0.8), { x: v.pos.x, y: groundY(v.pos.x, v.pos.z) + 0.9 - u * 0.4, z: v.pos.z }, 50, 4, rdt);
      }
      case "gun": {
        const g = this.field && this.field.guns[h.gun]; if (!g) break;
        const fw = [-Math.sin(g.ry + g.yaw), -Math.cos(g.ry + g.yaw)], rt = [fw[1], -fw[0]];
        if (u < 0.5) return sm.go(cam, P(g.x + rt[0] * 3.2 - fw[0] * 2.4, g.z + rt[1] * 3.2 - fw[1] * 2.4, 1.3), P(g.x + fw[0] * 8, g.z + fw[1] * 8, 1.0), 50, 6, rdt);
        if (!R.cut2) { R.cut2 = true; sm.cut(); }
        return sm.go(cam, P(at.x - fw[0] * 4 + rt[0] * 14, at.z - fw[1] * 4 + rt[1] * 14, 3.5), P(at.x, at.z, 0.8), 46, 3, rdt);
      }
      case "volley": {
        const sh = (h.ids || []).map(B).filter(Boolean), c = sh.length ? { x: sh.reduce((s, b) => s + b.pos.x, 0) / sh.length, z: sh.reduce((s, b) => s + b.pos.z, 0) / sh.length } : at;
        const yaw = sh[0] ? sh[0].a.yaw : 0, f = [Math.sin(yaw), Math.cos(yaw)], r = [f[1], -f[0]];
        let far = 0; for (const b of sh) far = Math.max(far, Math.abs((b.pos.x - c.x) * r[0] + (b.pos.z - c.z) * r[1]));
        return sm.go(cam, P(c.x + r[0] * (far + 5) + f[0] * 2.2, c.z + r[1] * (far + 5) + f[1] * 2.2, 1.55 + u * 0.4), P(c.x + f[0] * 4, c.z + f[1] * 4, 1.3), 46, 4, rdt);
      }
      case "clash": {
        // (round where it's thickest, close in)
        const a = R.a0 + u * 1.2;
        return sm.go(cam, P(at.x + Math.cos(a) * 6, at.z + Math.sin(a) * 6, 1.7), P(at.x, at.z, 1.0), 50, 2.5, rdt);
      }
      case "blast": {
        const a = R.a0;
        return sm.go(cam, P(at.x + Math.cos(a) * 15, at.z + Math.sin(a) * 15, 4 + u * 2), P(at.x, at.z, 0.6), 44, 3, rdt);
      }
      case "final": {
        // close on the last of them, then up and away over the field
        const a = R.a0 + u * 0.6, rr = 4 + ease(u) * 30, hh = 1.6 + ease(Math.max(0, u - 0.25) / 0.75) * 22;
        return sm.go(cam, P(at.x + Math.cos(a) * rr, at.z + Math.sin(a) * rr, hh), P(at.x, at.z, 0.5), 48, 3, rdt);
      }
    }
    const a = R.a0 + u; return sm.go(cam, P(at.x + Math.cos(a) * 12, at.z + Math.sin(a) * 12, 4), P(at.x, at.z, 1), 48, 3, rdt);
  }
  // the free eye: WASD, Q and E down and up, the mouse held down to look, Shift to hurry
  freeCam(cam, rdt) {
    const F = this.free ||= { x: camera.position.x, y: camera.position.y, z: camera.position.z, yaw: Math.atan2(-camera.getWorldDirection(_v).x, -camera.getWorldDirection(_v).z), pitch: -0.25 };
    const k = this.keys, sp = (k.has("ShiftLeft") || k.has("ShiftRight") ? 26 : 9) * rdt;
    const fx = -Math.sin(F.yaw), fz = -Math.cos(F.yaw), rx = Math.cos(F.yaw), rz = -Math.sin(F.yaw);
    if (k.has("KeyW")) { F.x += fx * sp; F.z += fz * sp; } if (k.has("KeyS")) { F.x -= fx * sp; F.z -= fz * sp; }
    if (k.has("KeyD")) { F.x += rx * sp; F.z += rz * sp; } if (k.has("KeyA")) { F.x -= rx * sp; F.z -= rz * sp; }
    if (k.has("KeyE") || k.has("Space")) F.y += sp; if (k.has("KeyQ") || k.has("KeyC")) F.y -= sp;
    const S = this.S, lim = (this.S.bound || 76) + 30, dx = F.x - S.x, dz = F.z - S.z, dd = Math.hypot(dx, dz);
    if (dd > lim) { F.x = S.x + dx / dd * lim; F.z = S.z + dz / dd * lim; }
    F.y = clamp(F.y, groundY(F.x, F.z) + 0.6, groundY(F.x, F.z) + 120);
    cam.position.set(F.x, F.y, F.z); cam.up.set(0, 1, 0); cam.rotation.set(F.pitch, F.yaw, 0, "YXZ");
    if (Math.abs(cam.fov - 55) > 0.05) { cam.fov = 55; cam.updateProjectionMatrix(); }
  }
  // ---- the controls ----
  ui() {
    let el = $("theatre");
    if (!el) { el = document.createElement("div"); el.id = "theatre"; document.body.appendChild(el); }
    el.className = `th-${this.mode}`; el.classList.remove("hidden");
    el.innerHTML = this.mode === "ambient" ? `<button class="th-amb" data-a="watch"><span class="th-amb-k">Highlights</span><b></b><small></small></button>` : `
      <div class="th-top"><div class="th-title"><b></b><small></small></div><div class="th-hint"></div></div>
      <div class="th-end hidden"></div>
      <div class="th-bar">
        <button data-a="play" class="th-b th-play" title="Play or pause (Space)"></button>
        <button data-a="back" class="th-b" title="Back ten seconds (←)">−10</button>
        <button data-a="fwd" class="th-b" title="On ten seconds (→)">+10</button>
        <span class="th-time"></span>
        <div class="th-line"><div class="th-marks"></div><div class="th-done"></div><div class="th-head"></div></div>
        <span class="th-dur"></span>
        <span class="th-grp th-speed">${[0.25, 0.5, 1, 2, 4].map(s => `<button data-speed="${s}">${s < 1 ? (s === 0.25 ? "¼" : "½") : s}×</button>`).join("")}</span>
        <span class="th-grp th-cams">${[["auto", "Director"], ["you", "You"], ["top", "Above"], ["free", "Free"]].map(([k, n]) => `<button data-cam="${k}" title="${n} (${["auto", "you", "top", "free"].indexOf(k) + 1})">${n}</button>`).join("")}</span>
        <button data-a="reel" class="th-b th-reel">Highlights</button>
        <button data-a="exit" class="th-b th-exit" title="Leave (Esc)">Leave</button>
      </div>`;
    el.onclick = e => this.click(e);
    const line = el.querySelector(".th-line");
    if (line) {
      const at = e => { const r = line.getBoundingClientRect(); return clamp((e.clientX - r.left) / r.width, 0, 1) * this.dur; };
      line.onpointerdown = e => { e.preventDefault(); this.dragging = true; if (this.reel) this.startFull(); this.seek(at(e)); line.setPointerCapture(e.pointerId); };
      line.onpointermove = e => { if (this.dragging) this.seek(at(e)); else line.title = mmss(at(e)); };
      line.onpointerup = () => { this.dragging = false; };
      // (the moments marked on it: the highlights, and every man down — yours and theirs in their colours)
      const R = this.d.names, S = this.S;
      line.querySelector(".th-marks").innerHTML = this.d.ev.filter(e => e.k === "d").map(e => `<i class="${(R.get(e.a[0]) || {}).team === 0 ? "us" : "them"}${e.a[0] === ME ? " me" : ""}" style="left:${(e.t / this.dur * 100).toFixed(2)}%"></i>`).join("")
        + this.hl.map(h => `<b title="${esc(h.cap)}" style="left:${(h.t0 / this.dur * 100).toFixed(2)}%;width:${((h.t1 - h.t0) / this.dur * 100).toFixed(2)}%"></b>`).join("");
      void S;
    }
    // drag to look, in the free eye
    this.pd = e => { if (this.cam !== "free" || e.target.closest(".th-bar,.th-top,.th-end")) return; this.look = { x: e.clientX, y: e.clientY }; };
    this.pm = e => { if (!this.look || !this.free) return; this.free.yaw -= (e.clientX - this.look.x) * 0.004; this.free.pitch = clamp(this.free.pitch - (e.clientY - this.look.y) * 0.004, -1.5, 1.5); this.look = { x: e.clientX, y: e.clientY }; };
    this.pu = () => { this.look = null; };
    // (the controls fade when the mouse is still, in the reel)
    this.mm = () => { this.lastMove = performance.now(); el.classList.remove("idle"); };
    this.kd = e => this.key(e, true); this.ku = e => this.key(e, false);
    if (this.mode !== "ambient") { addEventListener("pointerdown", this.pd); addEventListener("pointermove", this.pm); addEventListener("pointerup", this.pu); addEventListener("mousemove", this.mm); addEventListener("keydown", this.kd, true); addEventListener("keyup", this.ku, true); }
    this.lastMove = performance.now();
    this.drawUi(true);
  }
  drawUi(all = false) {
    const el = $("theatre"); if (!el) return;
    if (this.mode === "ambient") {
      const t = titleOf(this.tape), m = this.tape.meta || {};
      el.querySelector(".th-amb b").textContent = t.t;
      el.querySelector(".th-amb small").textContent = `${t.s}${m.at || this.tape.at ? ` · ${ago(m.at || this.tape.at)}` : ""} — watch`;
      return;
    }
    if (all) {
      const t = this.title || titleOf(this.tape);
      el.querySelector(".th-title b").textContent = t.t; el.querySelector(".th-title small").textContent = t.s;
      for (const b of el.querySelectorAll("[data-speed]")) b.classList.toggle("on", +b.dataset.speed === (this.reel ? -1 : this.rateWant || 1));
      for (const b of el.querySelectorAll("[data-cam]")) b.classList.toggle("on", !this.reel && b.dataset.cam === this.cam);
      el.querySelector(".th-reel").textContent = this.reel ? "Whole battle" : "Highlights";
      el.querySelector(".th-reel").title = this.reel ? "The whole battle, from any moment (H)" : "Its highlights (H)";
      el.querySelector(".th-dur").textContent = mmss(this.dur);
      el.querySelector(".th-hint").textContent = this.reel ? "" : this.cam === "free" ? "WASD to fly · Q / E down and up · hold the mouse to look · Shift to hurry" : "Space pauses · ← → ten seconds · 1–4 the eye · drag the line to go anywhere";
      el.classList.toggle("reel", !!this.reel);
      const end = el.querySelector(".th-end"), done = this.reel && !this.reel.h;
      end.classList.toggle("hidden", !done);
      if (done) end.innerHTML = `<button class="btn" data-a="again">Watch again</button><button class="btn" data-a="whole">The whole battle</button><button class="btn primary" data-a="exit">${this.from === "end" ? "Continue" : "Back"}</button>`;
    }
    el.querySelector(".th-play").textContent = this.paused ? "▶" : "❚❚";
    el.querySelector(".th-time").textContent = mmss(this.t);
    const k = this.dur ? this.t / this.dur * 100 : 0;
    el.querySelector(".th-done").style.width = `${k}%`; el.querySelector(".th-head").style.left = `${k}%`;
  }
  uiTick() {
    if ((this.uiT = (this.uiT || 0) + 1) % 6) return;
    this.drawUi();
    const el = $("theatre"); if (el && this.mode !== "ambient") el.classList.toggle("idle", performance.now() - this.lastMove > 2600 && !this.paused);
  }
  click(e) {
    const b = e.target.closest("button"); if (!b) return;
    window.__uisfx && window.__uisfx.click && window.__uisfx.click();
    if (b.dataset.speed) { if (this.reel) this.startFull(); this.rateWant = +b.dataset.speed; this.rate = this.rateWant; this.paused = false; this.drawUi(true); return; }
    if (b.dataset.cam) { if (this.reel) this.startFull(); this.cam = b.dataset.cam; this.free = null; this.sm.cut(); this.drawUi(true); return; }
    switch (b.dataset.a) {
      case "play": this.toggle(); break;
      case "back": this.jump(-10); break;
      case "fwd": this.jump(10); break;
      case "reel": this.reel ? this.startFull() : this.again(); break;
      case "again": this.again(); break;
      case "whole": this.startFull(); this.seek(0); break;
      case "exit": this.exit(); break;
      case "watch": if (this.onWatch) this.onWatch(this.tape); break;
    }
  }
  toggle() { if (this.reel && !this.reel.h) return this.again(); if (this.reel) this.startFull(); if (this.t >= this.dur - 0.05) this.seek(0); this.paused = !this.paused; this.rate = this.rateWant || 1; this.drawUi(true); }
  jump(s) { if (this.reel) this.startFull(); this.seek(this.t + s); this.drawUi(true); }
  again() { this.paused = false; this.rate = 1; this.seek(this.hl.length ? this.hl[0].t0 : 0); this.startReel(); this.drawUi(true); }
  key(e, down) {
    if (current !== this) return;
    if (e.target && /input|textarea/i.test(e.target.tagName)) return;
    const c = e.code;
    if (down) this.mm();
    if (["KeyW", "KeyA", "KeyS", "KeyD", "KeyQ", "KeyE", "KeyC", "Space", "ShiftLeft", "ShiftRight"].includes(c)) { if (down) this.keys.add(c); else this.keys.delete(c); }
    e.stopImmediatePropagation();
    if (!down || e.repeat) { if (c === "Space" || c.startsWith("Arrow")) e.preventDefault(); return; }
    if (c === "Escape") { e.preventDefault(); this.exit(); return; }
    if (c === "Space" && this.cam !== "free") { e.preventDefault(); this.toggle(); return; }
    if (c === "Enter" && this.reel && !this.reel.h) { e.preventDefault(); this.exit(); return; }
    if (c === "ArrowLeft") { e.preventDefault(); this.jump(-10); return; }
    if (c === "ArrowRight") { e.preventDefault(); this.jump(10); return; }
    if (c === "KeyH") { this.reel ? this.startFull() : this.again(); return; }
    const cams = { Digit1: "auto", Digit2: "you", Digit3: "top", Digit4: "free" };
    if (cams[c]) { if (this.reel) this.startFull(); this.cam = cams[c]; this.free = null; this.sm.cut(); this.drawUi(true); }
  }
  // ---- done ----
  exit() { const f = this.onExit; this.stop(); if (f) f(); }
  stop(quiet = false) {
    if (current !== this) return; current = null;
    clearTimeout(this.reel && this.reel.capT);
    const i = G.onFrame.indexOf(this.tickF); if (i >= 0) G.onFrame.splice(i, 1);
    G.timeWarp = this.warp0; G.deathCam = null; G.wasDeathCam = true; G.theatre = null;
    if (this.mode !== "ambient" || !quiet) AUDIO.scoreOff(1.2);
    AUDIO.hush(1);
    removeEventListener("pointerdown", this.pd); removeEventListener("pointermove", this.pm); removeEventListener("pointerup", this.pu); removeEventListener("mousemove", this.mm);
    removeEventListener("keydown", this.kd, true); removeEventListener("keyup", this.ku, true);
    const el = $("theatre"); if (el) { el.classList.add("hidden"); el.innerHTML = ""; }
    FILM.off();
    if (this.field) this.field.dispose();
    clearGore(); clearDropped();
    const pl = G.player; pl.frozen = false; if (pl.model) pl.model.root.visible = false;
    G.lockMove = false;
    if (G.mode === "theatre") G.mode = "title";
    camera.fov = 70; camera.updateProjectionMatrix();
  }
}
// (a stray theatre never outlives a game begun)
export function stopTheatre() { if (current) current.stop(true); }
