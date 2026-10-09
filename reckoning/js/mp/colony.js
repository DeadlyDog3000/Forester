// ===========================================================================
//  FORESTER: RECKONING — Copyright (c) 2026 Roan Fraese / DeadlyDog Productions
// ===========================================================================

// CO-OP: THE COLONY ITSELF, SHARED. One player's game is the colony — the real free play, every rule of it: building,
// stores, research, settlers and their work, raids, Europe. The others join that game. Their screens are built from
// the host's settlement the way a save is loaded (story.js startReplica), kept in step as it changes, and show the
// host's people where the host's game has them. What a guest does is sent to the host's game and done there, by the
// same code that does it for the host — so there is only ever one colony, and one set of rules.
//
// Host → guests (through the server, "h"):  snap (everything, to a newcomer) · sd (what changed in the settlement)
//                                            ax / ad / ar (the people and creatures: where they are, who's new, who's gone)
// Guest → host ("g"):                       act (something done: swing, use, plan, research…)

import { THREE } from "../core.js";
import { G, Actor, input } from "../engine.js";
import { UI, $ } from "../ui.js";
import { AUDIO } from "../audio.js";
import { FOLEY } from "../foley.js";
import { resetForMode, startReplica } from "../story.js";
import { Remote } from "./mpgame.js";
import { lookOpts, isF } from "./look.js";
import { MAX_HP } from "./rules.js";

const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
// the settlement as a save keeps it (the game's own bookkeeping, named with a leading underscore, left out)
const plain = v => JSON.parse(JSON.stringify(v, (k, x) => (k[0] === "_" ? undefined : x)));
const bKey = b => `${b.type}@${(+b.x).toFixed(2)},${(+b.z).toFixed(2)}`;

// ---------------------------------------------------------------------------
//  what both sides share: the others' bodies, talk, the people list
// ---------------------------------------------------------------------------
class ColonyBase {
  constructor(net, inMsg, me) {
    this.net = net; this.me = me; this.room = inMsg.room; this.pid = inMsg.you.pid; this.mode = "colony";
    this.remotes = new Map(); this.online = new Set(inMsg.online || []);
    this.chatLines = [];
    this.players = inMsg.players || [];
  }
  friendly() { return true; }
  nameOf(pid) { if (pid === this.pid) return this.me.name; const r = this.remotes.get(pid); return r ? r.name : "someone"; }
  addRemote(p) { if (p.pid === this.pid || this.remotes.has(p.pid)) return; this.remotes.set(p.pid, new Remote(this, p)); }
  listenCommon() {
    const n = this.net.on;
    n.ps = m => { for (const l of m.l) { const r = this.remotes.get(l[0]); if (r) r.set(l); } };
    n.pj = m => { this.online.add(m.p.pid); this.addRemote(m.p); this.joined && this.joined(m.p); };
    n.pl = m => { this.online.delete(m.pid); const r = this.remotes.get(m.pid); if (r) { r.remove(); this.remotes.delete(m.pid); } };
    n.chat = m => this.chatLine(m);
    n.note = m => this.chatLine({ name: "", text: m.text });
    n.err = m => UI.hint(m.text, 4);
  }
  hud(on) {
    // (the settlement's own screen is the game's; of the multiplayer one, only the talk and who's here)
    $("mpHud").classList.toggle("hidden", !on);
    document.body.classList.toggle("mp", on); document.body.classList.toggle("mp-colony", on);
    if (on) { $("mpRoom").textContent = this.room.name; $("mpMode").textContent = "Co-op · the colony"; }
  }
  chatLine(c, old) {
    this.chatLines.push({ who: c.name, text: c.text, at: old ? 0 : performance.now(), mine: c.pid === this.pid });
    if (this.chatLines.length > 40) this.chatLines.shift();
    this.drawChat();
  }
  drawChat() {
    const typing = !$("mpChatIn").classList.contains("hidden");
    $("mpChatLog").innerHTML = this.chatLines.slice(typing ? -12 : -6).map(l => `<div class="cl${l.who ? "" : " sys"}">${l.who ? `<b>${esc(l.who)}:</b> ` : ""}${esc(l.text)}</div>`).join("");
    clearTimeout(this._chatFade); $("mpChat").classList.remove("quiet");
    if (!typing) this._chatFade = setTimeout(() => $("mpChat").classList.add("quiet"), 9000);
  }
  openChat() {
    const i = $("mpChatIn"); i.classList.remove("hidden"); i.value = ""; i.focus(); this.drawChat();
    i.onkeydown = e => { e.stopPropagation(); if (e.key === "Enter") { const t = i.value.trim(); if (t) this.net.send({ t: "chat", text: t }); this.closeChat(); } else if (e.key === "Escape") this.closeChat(); };
  }
  closeChat() { const i = $("mpChatIn"); i.blur(); i.classList.add("hidden"); this.drawChat(); }
  // where you are, ten times a second (the server passes it on: it's how the others see you)
  sendSelf(dt) {
    if ((this.sendT = (this.sendT || 0) - dt) > 0) return; this.sendT = 0.1;
    const pl = G.player;
    this.net.send({ t: "st", x: +pl.pos.x.toFixed(2), y: +pl.pos.y.toFixed(2), z: +pl.pos.z.toFixed(2), yaw: +pl.yaw.toFixed(3), a: pl.swingT >= 0 ? "chop" : G.working && G.working.until > G.time ? G.working.kind || "idle" : "idle", h: "axe", s: +(pl.speed || 0).toFixed(2), g: !!input.rdown });
  }
  // keys of its own (talk); the rest are the game's, as in free play
  key(e) {
    if (e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return false;
    if (G.mode !== "play" || e.repeat) return false;
    if (e.code === "Enter") { e.preventDefault(); this.openChat(); return true; }
    return false;
  }
  leaveCommon(quiet) {
    this.closeChat();
    if (!quiet) { try { this.net.send({ t: "leave" }); } catch (e) {} }
    this.net.close();
    for (const r of this.remotes.values()) r.remove();
    this.remotes.clear();
    this.hud(false);
  }
}

// ---------------------------------------------------------------------------
//  the host: the colony is this game; the others are told what it is, and what happens in it
// ---------------------------------------------------------------------------
export class ColonyHost extends ColonyBase {
  constructor(net, inMsg, me, hooks) {
    super(net, inMsg, me);
    this.hooks = hooks || {};
    this.ids = new WeakMap(); this.nextId = 1; this.sentActors = new Map();   // actor id → actor, as the guests know them
    this.lastKeys = {};
    G.mp = this; this.host = true;
    G.achEvent && (G.achEvent("mp-join"), G.achEvent("mp-host"));
    for (const p of this.players) this.addRemote(p);
    this.listenCommon();
    this.net.on.g = m => this.fromGuest(m);
    this.net.on.lost = () => { if (G.mp !== this) return; this.leave(true); this.hooks.lost && this.hooks.lost("The connection to the server was lost. Your colony is saved; host it again to carry on."); };
    this.tickFn = dt => this.tick(dt);
    G.onFrame.push(this.tickFn);
    this.hud(true);
    this.chatLine({ name: "", text: "Your colony is open. Others can join it from the Multiplayer list; everything they do happens in your game." });
    // (anyone already waiting)
    for (const p of this.players) this.snapshot(p.pid);
    // the colony's news and word of its people, heard by everyone in it, not only you
    this.keepNews = UI.news; this.keepTell = G.tell;
    UI.news = (n, ...rest) => { if (this.remotes.size && !this.inRunAs) { try { this.net.send({ t: "h", m: { t: "news", n: plain(n) } }); } catch (e) {} } return this.keepNews.call(UI, n, ...rest); };
    G.tell = (...a) => { if (this.remotes.size && !this.inRunAs) { try { this.net.send({ t: "h", m: { t: "tell", a: plain(a) } }); } catch (e) {} } return this.keepTell && this.keepTell(...a); };
    // every tree that comes down, told at once, so they see it fall (wild ones too, which the settlement doesn't keep)
    G.town.onFell = (t, dx, dz) => { if (this.remotes.size) this.net.send({ t: "h", m: { t: "fell", x: t.x, z: t.z, dx, dz } }); };
  }
  idOf(a) { let id = this.ids.get(a); if (!id) { id = "a" + this.nextId++; this.ids.set(a, id); } return id; }
  // everything a newcomer needs: the settlement, the time, everyone in it, and where to stand
  snapshot(to) {
    const t = G.town; if (!t) return;
    const pl = G.player;
    this.net.send({ t: "h", to, m: { t: "snap", S: plain(t.S), clock: t.t, actors: this.actorDefs(true), at: { x: pl.pos.x + 1.5, z: pl.pos.z + 1.5 } } });
  }
  joined(p) { this.snapshot(p.pid); UI.hint(`${p.name} has joined your colony.`, 4); }
  // the people and creatures of the world (not the other players' bodies)
  worldActors() { return (G.world ? G.world.actors : []).filter(a => !a.remote && a.opts && a.root); }
  actorDefs(all) {
    const out = [];
    for (const a of this.worldActors()) { const id = this.idOf(a); if (all || !this.sentActors.has(id)) { out.push({ id, opts: plain(a.opts) }); this.sentActors.set(id, a); } }
    return out;
  }
  tick(dt) {
    const t = G.town; if (!t || G.mp !== this) return;
    this.sendSelf(dt);
    // where everyone in the world is, ten times a second
    if ((this.axT = (this.axT || 0) - dt) <= 0) {
      this.axT = 0.1;
      const neu = this.actorDefs(false);
      if (neu.length) this.net.send({ t: "h", m: { t: "ad", l: neu } });
      const live = new Set(), l = [];
      for (const a of this.worldActors()) {
        const id = this.idOf(a); live.add(id);
        const P = a.person;
        l.push([id, +a.pos.x.toFixed(2), +a.root.position.y.toFixed(2), +a.pos.z.toFixed(2), +a.yaw.toFixed(2), P.pose || "idle", +(a.speed || 0).toFixed(2), a.lieK != null ? +(+a.lieK).toFixed(2) : a.lying ? 1 : 0, a.root.visible ? 1 : 0, P.sitting ? +P.sitting.toFixed(2) : 0]);
      }
      const gone = [...this.sentActors.keys()].filter(id => !live.has(id));
      for (const id of gone) this.sentActors.delete(id);
      if (gone.length) this.net.send({ t: "h", m: { t: "ar", l: gone } });
      if (this.remotes.size) this.net.send({ t: "h", m: { t: "ax", l } });
    }
    // what changed in the settlement, once a second: whole parts of it that differ from what was last sent
    if ((this.sdT = (this.sdT || 0) - dt) <= 0) {
      this.sdT = 1;
      if (!this.remotes.size) { this.lastKeys = {}; return; }
      const S = t.S, d = {};
      for (const k of Object.keys(S)) {
        if (k[0] === "_") continue;
        let j; try { j = JSON.stringify(S[k], (kk, x) => (kk[0] === "_" ? undefined : x)); } catch (e) { continue; }
        if (this.lastKeys[k] !== j) { this.lastKeys[k] = j; d[k] = j === undefined ? null : JSON.parse(j); }
      }
      this.net.send({ t: "h", m: { t: "sd", d, clock: t.t } });
    }
  }
  // what a guest did, done here, in this game
  fromGuest(g) {
    const m = g.m || {};
    if (m.t === "hello") return this.snapshot(g.from);
    if (m.t === "act") { try { this.act(g.from, m); } catch (e) { console.warn("colony: a guest's action failed", m.a, e); } }
  }
  guest(pid) { return (this.guests ??= {})[pid] ??= { carryN: 0 }; }
  // something done as the guest: you (this game's player) stood aside for a moment, and they stand where they are,
  // facing as they face, carrying what they carry; what the game says to them is caught and sent to them
  runAs(pid, at, fn) {
    const pl = G.player, g = this.guest(pid), U = UI;
    const was = { x: pl.pos.x, y: pl.pos.y, z: pl.pos.z, yaw: pl.yaw, pitch: pl.pitch, carryN: pl.carryN, blade: pl.blade };
    const said = [], keep = { hint: U.hint, bark: U.bark, carry: U.carry, keys: U.keys, tell: G.tell, practise: G.practise, wear: G.wear, impact: G.impact, report: G.report };
    U.hint = (text) => said.push(text); U.bark = (who, text) => said.push(`${who}: ${text}`); U.carry = () => {}; U.keys = () => {};
    G.tell = (k, where, text) => said.push(text); G.practise = () => {}; G.wear = () => {}; G.impact = () => {}; G.report = () => {};
    if (at) { pl.pos.set(at.x, at.y, at.z); pl.yaw = at.yaw; pl.pitch = at.pitch || 0; }
    pl.carryN = g.carryN; pl.blade = "axe";
    let out; this.inRunAs = true;
    try { out = fn(); }
    finally {
      this.inRunAs = false;
      g.carryN = pl.carryN;
      pl.pos.set(was.x, was.y, was.z); pl.yaw = was.yaw; pl.pitch = was.pitch; pl.carryN = was.carryN; pl.blade = was.blade;
      Object.assign(U, { hint: keep.hint, bark: keep.bark, carry: keep.carry, keys: keep.keys });
      Object.assign(G, { tell: keep.tell, practise: keep.practise, wear: keep.wear, impact: keep.impact, report: keep.report });
    }
    if (typeof out === "string") said.push(out);
    this.net.send({ t: "h", to: pid, m: { t: "say", said: said.filter(Boolean).slice(0, 4), carry: g.carryN } });
    return out;
  }
  // a reference from the guest (a building, a person, a settlement) to the thing itself here
  deref(v) {
    const S = G.town.S;
    if (v && typeof v === "object" && v.$b) return S.buildings.find(b => bKey(b) === v.$b) || null;
    if (v && typeof v === "object" && v.$p) return S.people.find(p => p.name === v.$p) || null;
    if (v && typeof v === "object" && v.$c) return (S.colonies || []).find(c => c.name === v.$c) || null;
    return v;
  }
  act(pid, m) {
    const town = G.town, w = G.world; if (!town) return;
    switch (m.a) {
      case "swing": return this.runAs(pid, m.at, () => { G.onSwing && G.onSwing(); });
      case "use": {
        // the same thing, where they were looking: by where it is, and what it's called
        const lab = it => { try { return typeof it.label === "function" ? it.label() : it.label; } catch (e) { return ""; } };
        const head = s => String(s || "").replace(/\s*\(.*$/, "");
        let best = null, bd = 1.6;
        this.runAs(pid, m.at, () => {
          for (const it of w.interact) {
            if (it.can && !it.can()) continue;
            const d = Math.hypot((it.x ?? 0) - m.x, (it.z ?? 0) - m.z) - (head(lab(it)) === head(m.label) ? 1 : 0);
            if (d < bd) { bd = d; best = it; }
          }
          if (best) best.use(); else UI.hint("That can't be done just now.", 2);
        });
        return;
      }
      case "plan": {
        const b = m.b; if (!b || !BUILDINGS_OK(b.type)) return;
        return this.runAs(pid, m.at, () => {
          if (!town.fits(b.type, b.x, b.z, b.ry)) return "Something's in the way there now.";
          if (b.type === "field" && (town.S.seed || 0) < 1) return "There's no rye seed to sow a field with.";
          town.commitPlan({ type: b.type, x: b.x, z: b.z, ry: b.ry, logs: 0, dug: 0, done: !!b.done });
        });
      }
      case "call": {
        if (!CALLS.has(m.fn) || typeof town[m.fn] !== "function") return;
        return this.runAs(pid, m.at, () => town[m.fn](...(m.args || []).map(v => this.deref(v))));
      }
      case "set": {
        // the settlement's own settings changed from their screens (jobs, names, laws, taxes…): put into ours
        const S = town.S;
        for (const [k, v] of Object.entries(m.d || {})) {
          if (k === "buildings" || k === "felled" || k === "logs") continue;     // (those change only by what's done)
          if (k === "people" && Array.isArray(v)) { for (const np of v) { const op = S.people.find(p => p.name === np.name); if (op) Object.assign(op, np); } continue; }
          if (k === "colonies" && Array.isArray(v)) { for (const nc of v) { const oc = (S.colonies || []).find(c => c.name === nc.name); if (oc) Object.assign(oc, nc); } continue; }
          S[k] = v;
        }
        town.persist(); town.showStore && town.showStore();
        return;
      }
    }
  }
  leave(quiet) {
    if (G.mp !== this) return;
    const i = G.onFrame.indexOf(this.tickFn); if (i >= 0) G.onFrame.splice(i, 1);
    if (G.town) G.town.onFell = null;
    if (this.keepNews) UI.news = this.keepNews; if (this.keepTell) G.tell = this.keepTell;
    this.leaveCommon(quiet);
    G.mp = null;
  }
}
// what the others may ask the colony's game to do, from the government and the buildings' own screens
const CALLS = new Set(["research", "recruit", "train", "upgrade", "upgradeHome", "repair", "makePeace", "leave", "enlargeRoom", "enlarge", "dismantle", "claim", "chooseJob", "stableIt"]);
const BUILDINGS_OK = type => typeof type === "string" && /^[a-z_]+$/.test(type);

// ---------------------------------------------------------------------------
//  a guest: the host's colony, as the host's game says it is
// ---------------------------------------------------------------------------
class Mirror {
  // one of the host's people (or beasts): eased toward where the host's game has them
  constructor(id, opts) {
    this.id = id;
    const a = this.actor = new Actor(opts, 0, 0, 0);
    a.mirror = this; a.update = dt => this.update(dt);
    this.tx = 0; this.ty = 0; this.tz = 0; this.tyaw = 0; this.pose = "idle"; this.spd = 0; this.lie = 0; this.vis = 1; this.sit = 0; this.fresh = true;
  }
  set(l) { [, this.tx, this.ty, this.tz, this.tyaw, this.pose, this.spd, this.lie, this.vis, this.sit] = l; if (this.fresh) { this.fresh = false; const a = this.actor; a.pos.x = this.tx; a.pos.z = this.tz; a.yaw = this.tyaw; } }
  update(dt) {
    const a = this.actor, k = Math.min(1, dt * 9);
    // (a long way off: put there, not slid there)
    if (Math.hypot(this.tx - a.pos.x, this.tz - a.pos.z) > 8) { a.pos.x = this.tx; a.pos.z = this.tz; }
    a.pos.x += (this.tx - a.pos.x) * k; a.pos.z += (this.tz - a.pos.z) * k;
    a.yaw += Math.atan2(Math.sin(this.tyaw - a.yaw), Math.cos(this.tyaw - a.yaw)) * Math.min(1, dt * 8);
    a.speed = this.spd; a.lieK = this.lie; a.lying = this.lie > 0.5;
    a.person.setPose(this.pose || "idle");
    a.person.sitting = this.sit || 0;
    a.person.update(dt, this.spd);
    a.sync();
    a.root.position.y = this.ty;
    a.root.visible = !!this.vis;
  }
  remove() { this.actor.remove(); }
}

export class ColonyGuest extends ColonyBase {
  constructor(net, inMsg, me, hooks) {
    super(net, inMsg, me);
    this.hooks = hooks || {};
    this.mirrors = new Map();
    G.mp = this; this.host = false; this.ready = false;
    this.listenCommon();
    const n = this.net.on;
    n.h = m => this.fromHost(m.m || {});
    n.ended = m => { if (G.mp !== this) return; this.leave(true); this.hooks.lost && this.hooks.lost(m.text || "The colony has closed."); };
    n.lost = () => { if (G.mp !== this) return; this.leave(true); this.hooks.lost && this.hooks.lost("The connection to the colony was lost."); };
    // (ask for the colony, in case the host's game missed us coming in)
    setTimeout(() => { if (!this.ready && G.mp === this) this.net.send({ t: "g", m: { t: "hello" } }); }, 2500);
  }
  fromHost(m) {
    if (m.t === "snap") return this.build(m);
    if (!this.ready) return;
    if (m.t === "sd") return this.apply(m.d, m.clock);
    if (m.t === "ad") { for (const d of m.l) this.addMirror(d); return; }
    if (m.t === "ar") { for (const id of m.l) { const x = this.mirrors.get(id); if (x) { x.remove(); this.mirrors.delete(id); } } return; }
    if (m.t === "ax") { for (const l of m.l) { const x = this.mirrors.get(l[0]); if (x) x.set(l); } return; }
    if (m.t === "say") return this.said(m);
    if (m.t === "news") { try { UI.news(m.n); } catch (e) {} return; }
    if (m.t === "tell") { try { G.tell && G.tell(...(m.a || [])); } catch (e) {} return; }
    if (m.t === "fell") return this.treeFalls(m);
  }
  // what you do here goes to the host's game, to be done there
  at() { const p = G.player; return { x: +p.pos.x.toFixed(2), y: +p.pos.y.toFixed(2), z: +p.pos.z.toFixed(2), yaw: +p.yaw.toFixed(3), pitch: +p.pitch.toFixed(3) }; }
  send(a, more) { this.net.send({ t: "g", m: { t: "act", a, at: this.at(), ...more } }); }
  ref(v) {
    const S = this.town.S;
    if (v && typeof v === "object") {
      if (S.buildings.includes(v)) return { $b: bKey(v) };
      if (S.people.includes(v)) return { $p: v.name };
      if ((S.colonies || []).includes(v)) return { $c: v.name };
    }
    return v;
  }
  wire(town) {
    // the axe: the blow is struck in the host's game (the chips and the sound, here at once)
    G.onSwing = () => { this.send("swing"); };
    // F on anything: done there
    G.mpUse = it => {
      let label = ""; try { label = typeof it.label === "function" ? it.label() : it.label; } catch (e) {}
      this.send("use", { label, x: it.x ?? 0, z: it.z ?? 0 });
      return true;
    };
    // plans laid out here are built there
    town.remoteAct = (a, b) => this.send(a, { b: { type: b.type, x: b.x, z: b.z, ry: b.ry, done: !!b.done } });
    // the government's doings
    for (const fn of ["research", "recruit", "train", "upgrade", "upgradeHome", "repair", "makePeace", "leave", "enlargeRoom", "enlarge", "dismantle", "claim", "chooseJob", "stableIt"])
      town[fn] = (...args) => { this.send("call", { fn, args: args.map(v => this.ref(v)) }); return null; };
    town.recruitCost = () => Math.max(4, 12 - 2 * (town.hallTier || 0));
    // and what's changed straight in the settlement from a screen (a job, a law, a name): sent when it would be saved
    this.hostJSON = {};
    for (const k of Object.keys(town.S)) this.hostJSON[k] = JSON.stringify(town.S[k]);
    town.persist = () => {
      const d = {};
      for (const k of Object.keys(town.S)) { if (k[0] === "_" || k === "buildings" || k === "felled" || k === "logs") continue; const j = JSON.stringify(town.S[k]); if (j !== this.hostJSON[k]) { d[k] = JSON.parse(j); this.hostJSON[k] = j; } }
      if (Object.keys(d).length) this.send("set", { d });
    };
    // furnishing the cabin is the host's to do
    town.furnish = () => UI.hint("Furnishing the cabin is for the colony's host.", 3);
  }
  // what the host's game said back
  said(m) { for (const t of m.said || []) UI.hint(t, 4); G.player.carryN = m.carry || 0; UI.carry(G.player.carryN ? `Carrying ${G.player.carryN} log${G.player.carryN > 1 ? "s" : ""}` : null); }
  // a tree coming down in the host's game: seen coming down here
  treeFalls(m) {
    const w = this.w;
    let t = w.fellable.find(q => Math.abs(q.x - m.x) < 0.3 && Math.abs(q.z - m.z) < 0.3 && (q.state === "up" || q.state === "shake"));
    if (!t && w.forest) { const s = w.forest.find(q => !q.gone && Math.abs(q.x - m.x) < 0.3 && Math.abs(q.z - m.z) < 0.3); if (s) { t = w.adopt(s); t.wild = true; } }
    if (!t) return;
    const l = Math.hypot(m.dx, m.dz) || 1;
    t.state = "falling"; t.fall = 0; t.col.disabled = true;
    t.dir = { x: m.dx / l, z: m.dz / l }; t.axis = new THREE.Vector3(m.dz / l, 0, -m.dx / l);
    const heard = Math.hypot(t.x - G.player.pos.x, t.z - G.player.pos.z) < 45;
    if (heard) FOLEY.fellStart({ x: t.x, z: t.z });
    t.onDown = () => { if (heard) { const r = (t.h || 9) * 0.5; FOLEY.crash(1, { x: t.x + t.dir.x * r, z: t.z + t.dir.z * r }); } setTimeout(() => { if (t.state !== "up") this.town.fellNow(t, true); }, 1500); };
  }
  addMirror(d) { if (this.mirrors.has(d.id)) return; try { this.mirrors.set(d.id, new Mirror(d.id, d.opts)); } catch (e) { console.warn("colony: couldn't show", d.id, e); } }
  // the colony, built as the host's game has it
  build(snap) {
    if (this.ready) { this.apply(snap.S, snap.clock, true); return; }
    resetForMode();
    G.mp = this;
    G.who = isF(this.me.look) ? "sister" : "brother";
    const { w, town } = startReplica(snap);
    this.w = w; this.town = town;
    const pl = G.player;
    pl.setModel(lookOpts(this.me.look, this.me.name)); pl.model.scaleBase = this.me.look.height || 1;
    pl.blade = "axe"; pl.crouched = false; pl.seated = false; pl.frozen = false; pl.carryN = 0;
    pl.place(snap.at.x, snap.at.z, 0);
    G.hasMap = true; G.mode = "play";
    for (const d of snap.actors || []) this.addMirror(d);
    for (const p of this.players) this.addRemote(p);
    this.tickFn = dt => this.tick(dt);
    G.onFrame.push(this.tickFn);
    this.wire(town);
    this.ready = true;
    G.achEvent && (G.achEvent("mp-join"), G.achEvent("colony-join"));
    this.hud(true);
    UI.fade(0, 1.2);
    AUDIO.music && AUDIO.music("settlement");
    this.chatLine({ name: "", text: `You've joined ${this.room.host ? this.room.host + "'s" : "the"} colony, ${town.S.name || "the clearing"}.` });
    UI.hint(`${town.S.name || "The colony"} — ${this.room.host || "your host"}'s settlement. Enter to talk.`, 6);
  }
  // the parts of the settlement that changed, put in place; the time kept with the host's
  apply(d, t, all) {
    const town = this.town, S = town.S;
    for (const [k, v] of Object.entries(d)) {
      if (this.hostJSON) this.hostJSON[k] = JSON.stringify(v);
      if (k === "buildings") this.syncBuildings(v || []);
      else if (k === "felled") this.syncFelled(v || []);
      else if (k === "logs") this.syncLogs(v || []);
      else if (v === null) delete S[k];
      else S[k] = v;
    }
    if (["store", "stone", "planks", "bricks", "rye", "bread"].some(k => k in d) && town.showStore) town.showStore();
    // (the clock: put right if it has wandered, so day and night and the seasons are the host's)
    if (t != null && Math.abs(town.t - t) > (all ? 0 : 2)) town.t = t;
  }
  syncBuildings(list) {
    const town = this.town, S = town.S, have = new Map(S.buildings.map(b => [bKey(b), b])), seen = new Set();
    for (const nb of list) {
      const k = bKey(nb); seen.add(k);
      const ob = have.get(k);
      if (!ob) { S.buildings.push(nb); town.show(nb); if (!nb.done && nb.type !== "path") town.site(nb); continue; }
      const before = JSON.stringify(ob);
      for (const key of Object.keys(ob)) if (!(key in nb) && key[0] !== "_") delete ob[key];
      Object.assign(ob, nb);
      if (JSON.stringify(ob) !== before) town.show(ob);
    }
    for (const [k, b] of have) if (!seen.has(k)) {
      const g = town.vis.get(b);
      if (g) { this.w.root.remove(g); if (g.userData.col) this.w.col.remove(g.userData.col); for (const c of g.userData.cols || []) this.w.col.remove(c); town.vis.delete(b); }
      S.buildings.splice(S.buildings.indexOf(b), 1);
    }
  }
  syncFelled(list) {
    const town = this.town, w = this.w, now = new Set(list.map(f => f.i)), was = new Set(town.S.felled.map(f => f.i));
    town.S.felled = list;
    for (const f of list) if (!was.has(f.i)) { let t = w.fellable[f.i]; if (f.x != null && (!t || Math.hypot(t.x - f.x, t.z - f.z) > 0.5)) t = w.fellable.find(q => Math.hypot(q.x - f.x, q.z - f.z) < 0.5); if (t && t.state !== "gone" && t.state !== "falling") town.fellNow(t, true); }
    for (const i of was) if (!now.has(i)) { const t = w.fellable[i]; if (t && t.state === "gone") { town.S.felled.push({ i }); town.regrow(t); } }
  }
  syncLogs(list) {
    const town = this.town;
    for (const b of town.bundles.slice()) town.pickUp(b);
    for (const l of list) town.dropLogs(l.x, l.z, l.a, l.n, true);
    town.S.logs = list;
  }
  tick(dt) { if (G.mp !== this || !this.ready) return; this.sendSelf(dt); }
  leave(quiet) {
    if (G.mp !== this) return;
    const i = G.onFrame.indexOf(this.tickFn); if (i >= 0) G.onFrame.splice(i, 1);
    for (const x of this.mirrors.values()) x.remove();
    this.mirrors.clear();
    this.leaveCommon(quiet);
    if (G.town) { G.town.stop && G.town.stop(); G.town = null; }
    G.mpUse = null; G.onSwing = null;
    G.mp = null;
  }
}
void THREE; void MAX_HP;
