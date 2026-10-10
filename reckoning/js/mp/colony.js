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
import { BUILDINGS } from "../town.js";
import { strikeYou, glint } from "../fight.js";

const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
// the settlement as a save keeps it (the game's own bookkeeping, named with a leading underscore, left out)
const plain = v => JSON.parse(JSON.stringify(v, (k, x) => (k[0] === "_" ? undefined : x)));
const bKey = b => `${b.type}@${(+b.x).toFixed(2)},${(+b.z).toFixed(2)}`;

// ---------------------------------------------------------------------------
//  what both sides share: the others' bodies, talk, the people list
// ---------------------------------------------------------------------------
export class ColonyBase {
  constructor(net, inMsg, me) {
    this.net = net; this.me = me; this.room = inMsg.room; this.pid = inMsg.you.pid; this.mode = "colony";
    this.remotes = new Map(); this.online = new Set(inMsg.online || []);
    this.chatLines = [];
    this.players = inMsg.players || [];
  }
  friendly() { return true; }
  // the board's second line in a co-op colony: the one thing you, yourself, would do best to do next — plainly, with the key
  nextForYou() {
    const b = G.body, pl = G.player, t = G.town; if (!b || !pl || !t) return "";
    const tl = b.tools || {}, S = t.S, logs = S.store || 0, shed = S.buildings.some(x => x.type === "woodshed" && x.done);
    if ((b.thirst ?? 1) < 0.35) return "You're thirsty — F at the brook, the pond or a well to drink; or F at the fire to boil a pot of water and drink it safe";
    if ((b.hunger ?? 1) < 0.3) return "You're hungry — eat what you carry (press its number), or hunt in the deer ride and cook the meat at the fire (F)";
    if (pl.carryN) return `Carry your ${pl.carryN} log${pl.carryN > 1 ? "s" : ""} to a building site, or put ${pl.carryN > 1 ? "them" : "it"} on the ${shed ? "woodshed" : "stack"} by the cabin (F)`;
    if (!pl.hasBow) return logs >= 2 ? "Make a hunting bow: F at the chopping block by the cabin (2 logs from the stack)" : "Fell a tree (click with the axe) and stack its logs (F) — two make a hunting bow at the chopping block";
    if ((pl.arrows || 0) < 4) return "Make arrows: F at the chopping block — a log and a stone for a dozen (stone: break a grey rock with the axe)";
    if (!tl.canteen) return "Make a canteen at the chopping block (F) — fill it at the brook (its number), then press its number by the fire to boil it";
    const site = S.buildings.find(x => !x.done && !x.gone && BUILDINGS[x.type] && !["path", "field", "fence", "wall"].includes(x.type));
    if (site) return `Help raise the ${BUILDINGS[site.type].name.toLowerCase()}: fell trees, take the logs (F) and carry them to its site (F there)`;
    if ((S.hide || 0) + (((G.pack || []).find(i => i.icon === "hide") || {}).n || 0) > 0 && S.buildings.some(x => x.type === "tannery" && x.done)) return "Tan a hide: F at the front of the tanning rack";
    return "Hunt in the deer ride for meat and hides — hold right-click to draw the bow, let go to loose; F to dress what you bring down";
  }
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
    // (lying in bed waiting for the others: a step, and you're up again)
    if (this.inBed && /^(KeyW|KeyA|KeyS|KeyD|Space)$/.test(e.code)) { this.outOfBed(); return true; }
    if (e.code === "Enter") { e.preventDefault(); this.openChat(); return true; }
    return false;
  }
  // the night, by the colony's clock (as the free play's bed has it)
  night() { const t = G.town; if (!t) return false; const f = t.frac ?? 0.5; return f > 0.6 || f < 0.04; }
  // into bed: the screen goes dim, and you wait for the others; when everyone is down, the night passes for all
  lieDown(here) {
    this.inBed = true; G.lockMove = true; UI.fade(0.75, 1.2);
    const bed = !here && G.world.bedSpot && G.world.bedSpot(0); if (bed) G.player.place(bed.x + Math.sin(bed.ry) * 0.9, bed.z + Math.cos(bed.ry) * 0.9, bed.ry + Math.PI);
    UI.hint("You lie down. When everyone in the colony is in bed, the night passes. (A step gets you up again.)", 6);
  }
  outOfBed(quiet) {
    if (!this.inBed) return;
    this.inBed = false; G.lockMove = false; UI.fade(0, 0.8);
    if (!quiet) this.bedChanged && this.bedChanged(false);
  }
  // there's one bed in the cabin, and more of you than that: so anyone can bed down for the night by a fire, or in any
  // cabin the colony has built
  bedroll(w, go) {
    const spot = () => {
      const pl = G.player, t = G.town; if (!pl || !t) return null;
      let best = null, bd = 6;
      for (const b of t.S.buildings) if (b.type === "cabin" && b.done && !b.gone) { const d = Math.hypot(b.x - pl.pos.x, b.z - pl.pos.z); if (d < bd) { bd = d; best = { x: b.x, z: b.z, what: "Bed down in the cabin" }; } }
      for (const f of w.flames || []) {
        const fl = f.userData && f.userData.flame; if (!fl || !(fl.base > 0.5) || !f.parent) continue;
        const p = f.getWorldPosition(f.position.clone()), d = Math.hypot(p.x - pl.pos.x, p.z - pl.pos.z);
        if (d < Math.min(bd, 4)) { bd = d; best = { x: p.x, z: p.z, what: "Bed down by the fire" }; }
      }
      return best;
    };
    let at = null, t = 0;
    const tick = dt => { if ((t -= dt) <= 0) { t = 0.25; at = this.night() && !this.inBed ? spot() : null; } };
    G.onFrame.push(tick); this.rollTick = tick;
    this.rollIt = w.addInteract({ get x() { return at ? at.x : 1e6; }, get z() { return at ? at.z : 1e6; }, get y() { return at ? w.heightAt(at.x, at.z) + 0.6 : 0; }, reach: 4.5, local: true,
      can: () => !!at && this.night() && !this.inBed && !(G.player && G.player.horse),
      label: () => `${at ? at.what : "Bed down"} for the night — it passes when everyone's in bed`,
      use: () => go() });
  }
  // the night gone: up with the others, by the bed, in the morning light
  wake() {
    this.inBed = false;
    UI.fade(1, 0.8);
    setTimeout(() => { UI.fade(0, 1.6); G.lockMove = false; }, 2200);
  }
  leaveCommon(quiet) {
    if (this.rollIt && G.world) G.world.removeInteract(this.rollIt);
    if (this.rollTick) { const i = G.onFrame.indexOf(this.rollTick); if (i >= 0) G.onFrame.splice(i, 1); }
    if (this.inBed) { this.inBed = false; G.lockMove = false; UI.fade(0, 0.3); }
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
    G.mp = this; this.host = true; this.ownSave = true;
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
    // the bed: in a colony with others in it, the night passes only when everyone has gone to bed
    this.origSleep = G.world.onSleep;
    if (this.origSleep) G.world.onSleep = { label: "Go to bed — the night passes when everyone has", can: () => this.night() && !this.inBed && (!this.origSleep.can || this.origSleep.can()),
      use: () => { if (!this.remotes.size) return this.origSleep.use(); this.lieDown(); this.bedChanged(true); } };
    this.bedroll(G.world, () => { if (!this.remotes.size && this.origSleep) return this.origSleep.use(); this.lieDown(true); this.bedChanged(true); });
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
  // the others, as the raiders see them: someone to square up to, to wind up at, and to strike — the blow itself is taken
  // in their own game, where their guard is
  foeFor(pid) {
    if (!pid || !this.remotes.has(pid)) return null;
    const F = this.foes ??= new Map();
    let f = F.get(pid);
    if (!f) { f = { guest: pid, fighting: true, duel: null, down: false, get pos() { const r = this.host.remotes.get(pid); return r ? r.actor.pos : { x: 1e6, y: 0, z: 1e6 }; }, live: () => this.remotes.has(pid) && !f.down }; f.host = this; F.set(pid, f); }
    return f;
  }
  raidFoes() { return [...this.remotes.keys()].map(pid => this.foeFor(pid)).filter(Boolean); }
  raidWind(f, r) { this.net.send({ t: "h", to: f.guest, m: { t: "rwind", id: this.idOf(r.a) } }); }
  raidStrike(f, r, W, d) { this.net.send({ t: "h", to: f.guest, m: { t: "rstrike", id: this.idOf(r.a), dir: r.dir, dmg: W.dmg, d: +d.toFixed(2) } }); }
  // who is in bed, said to everyone; and if that's all of them, morning
  bedChanged(down, pid) {
    const who = pid ? this.nameOf(pid) : this.me.name, n = this.sleepers().length, all = this.remotes.size + 1;
    this.bedNote(down ? `${who} has gone to bed (${n} of ${all}).` : `${who} is up again.`);
    this.checkBeds();
  }
  sleepers() { return [...(this.inBed ? [this.pid] : []), ...[...this.remotes.keys()].filter(pid => this.guest(pid).inBed)]; }
  bedNote(text) { this.chatLine({ name: "", text }); if (this.remotes.size) this.net.send({ t: "h", m: { t: "bednote", text } }); }
  checkBeds() {
    if (!this.sleepers().length) return;
    // (morning came by itself: up, all of you)
    if (!this.night()) { for (const pid of this.remotes.keys()) this.guest(pid).inBed = false; if (this.inBed) this.outOfBed(true); this.net.send({ t: "h", m: { t: "morning", natural: true } }); return; }
    if (this.sleepers().length < this.remotes.size + 1) return;
    for (const pid of this.remotes.keys()) this.guest(pid).inBed = false;
    this.inBed = false;
    this.net.send({ t: "h", m: { t: "morning" } });
    // (the night passed as it always is: the screen dark, the clock on to dawn, you up by the bed)
    try { this.origSleep.use(); } catch (e) { G.lockMove = false; UI.fade(0, 1); }
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
      // the beasts of the woods, which aren't people: where each is, how it goes, and whether it's down
      const H = G.hunt;
      if (this.remotes.size && H && H.w === G.world) this.net.send({ t: "h", m: { t: "hx", l: H.animals.map(a => [this.idOf(a), a.K && a.K.upright ? "man" : a.kind, +a.pos.x.toFixed(2), +a.pos.z.toFixed(2), +a.yaw.toFixed(2), +(a.speed || 0).toFixed(2), a.state, +(a.head ?? 1).toFixed(2), a.fawn ? 1 : 0]) } });
    }
    // what changed in the settlement, once a second: whole parts of it that differ from what was last sent
    if ((this.sdT = (this.sdT || 0) - dt) <= 0) {
      this.sdT = 1;
      if (this.guests) for (const pid of Object.keys(this.guests)) if (!this.remotes.has(pid)) this.guests[pid].inBed = false;
      this.checkBeds();
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
    const was = { x: pl.pos.x, y: pl.pos.y, z: pl.pos.z, yaw: pl.yaw, pitch: pl.pitch, carryN: pl.carryN, blade: pl.blade, working: G.working, pack: G.pack };
    let opened = false;
    const OPEN = ["openChest", "openCraft", "openNews", "openTrade", "openKitchen", "showGov"], keepOpen = {};
    for (const k of OPEN) { keepOpen[k] = G[k]; if (G[k]) G[k] = () => { opened = true; }; }
    const said = [], keep = { hint: U.hint, bark: U.bark, carry: U.carry, keys: U.keys, tell: G.tell, practise: G.practise, wear: G.wear, impact: G.impact, report: G.report, achEvent: G.achEvent, setTimeout: window.setTimeout };
    U.hint = (text) => said.push(text); U.bark = (who, text) => said.push(`${who}: ${text}`); U.carry = () => {}; U.keys = () => {};
    G.tell = (k, where, text) => said.push(text); G.practise = () => {}; G.wear = () => {}; G.impact = () => {}; G.report = () => {}; G.achEvent = () => {};
    // (their pack, not yours: what they carry, as they last sent it)
    G.pack = g.pack || [];
    // (and whatever it leaves to be done a moment later is done as them too, and told to them, not you)
    window.setTimeout = (cb, ms, ...args) => keep.setTimeout.call(window, () => { if (G.mp === this && typeof cb === "function") this.runAs(pid, null, () => cb(...args)); }, ms);
    if (at) { pl.pos.set(at.x, at.y, at.z); pl.yaw = at.yaw; pl.pitch = at.pitch || 0; }
    pl.carryN = g.carryN; pl.blade = "axe";
    const packWas = JSON.stringify(G.pack);
    let out, work = null; this.inRunAs = true; const runWas = this.runPid; this.runPid = pid;
    try { out = fn(); }
    finally {
      this.inRunAs = false; this.runPid = runWas;
      g.carryN = pl.carryN;
      // (the work it set them to: theirs to do, there; you carry on with yours)
      if (G.working !== was.working && G.working && G.working.until > G.time) work = { kind: G.working.kind, secs: +(G.working.until - G.time).toFixed(2) };
      G.working = was.working;
      g.pack = G.pack; G.pack = was.pack;
      pl.pos.set(was.x, was.y, was.z); pl.yaw = was.yaw; pl.pitch = was.pitch; pl.carryN = was.carryN; pl.blade = was.blade;
      Object.assign(U, { hint: keep.hint, bark: keep.bark, carry: keep.carry, keys: keep.keys });
      Object.assign(G, { tell: keep.tell, practise: keep.practise, wear: keep.wear, impact: keep.impact, report: keep.report, achEvent: keep.achEvent });
      window.setTimeout = keep.setTimeout;
      Object.assign(G, keepOpen);
    }
    if (typeof out === "string") said.push(out);
    const packNow = JSON.stringify(g.pack), m = { t: "say", said: said.filter(Boolean).slice(0, 4), carry: g.carryN };
    if (packNow !== packWas) m.pack = JSON.parse(packNow);
    if (work) m.work = work;
    // (a screen it would have opened — a chest, the chopping block, a trader — is theirs to open, on their own screen)
    if (opened) m.local = true;
    this.net.send({ t: "h", to: pid, m });
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
    if (Array.isArray(m.pack)) this.guest(pid).pack = m.pack;
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
      case "rparry": {
        const r = G.town && G.town.raids && G.town.raids.band.find(x => this.ids.get(x.a) === m.id);
        if (r && r.alive) { r.stun = 1.1; r.cool = Math.max(r.cool, 1.4); r.a.path = []; r.a.person.flinch && r.a.person.flinch(); }
        return;
      }
      case "downed": { const f = this.foeFor(pid); if (f) { f.down = !!m.on; if (f.down) for (const r of (G.town.raids && G.town.raids.band) || []) if (r.duel === f) r.duel = null; } return; }
      case "bed": { if (!this.night()) return; this.guest(pid).inBed = true; this.bedChanged(true, pid); return; }
      case "unbed": { if (!this.guest(pid).inBed) return; this.guest(pid).inBed = false; this.bedChanged(false, pid); return; }
      case "hunthit": {
        const a = G.hunt && G.hunt.animals.find(x => this.ids.get(x) === m.id);
        if (a && a.alive) this.runAs(pid, m.at, () => a.hit(Math.min(2.6, +m.power || 1), !!m.head));
        return;
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
        // (counts — the stores, the treasury — as what was added or taken, so two people at the stores at once both count)
        for (const [k, v] of Object.entries(m.inc || {})) if (typeof v === "number" && isFinite(v) && (S[k] == null || typeof S[k] === "number")) S[k] = Math.max(0, (S[k] || 0) + v);
        town.persist(); town.showStore && town.showStore();
        return;
      }
    }
  }
  leave(quiet) {
    if (G.mp !== this) return;
    const i = G.onFrame.indexOf(this.tickFn); if (i >= 0) G.onFrame.splice(i, 1);
    if (G.town) G.town.onFell = null;
    if (this.origSleep && G.world) G.world.onSleep = this.origSleep;
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
    if (m.t === "rwind") { const x = this.mirrors.get(m.id); if (x) glint(x.actor); return; }
    if (m.t === "rstrike") {
      const x = this.mirrors.get(m.id); if (!x || G.downed) return;
      if (strikeYou(x.actor, m.dir, m.dmg, m.d, this.tips ??= {}) === "parry") this.send("rparry", { id: m.id });
      return;
    }
    if (m.t === "bednote") return this.chatLine({ name: "", text: m.text });
    if (m.t === "morning") { if (this.inBed) { if (m.natural) this.outOfBed(true); else this.wake(); } return; }
    if (m.t === "hx") { if (G.hunt && G.hunt.w === this.w) G.hunt.puppets(m.l || []); return; }
  }
  // your arrow in one of the host's beasts: told to their game, where it's brought down (or not)
  huntHit(a, power, head) { this.send("hunthit", { id: a.netId, power: +(+power).toFixed(2), head: !!head }); }
  // what you do here goes to the host's game, to be done there
  at() { const p = G.player; return { x: +p.pos.x.toFixed(2), y: +p.pos.y.toFixed(2), z: +p.pos.z.toFixed(2), yaw: +p.yaw.toFixed(3), pitch: +p.pitch.toFixed(3) }; }
  send(a, more) { this.net.send({ t: "g", m: { t: "act", a, at: this.at(), pack: G.pack || [], ...more } }); }
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
      if (it.local || this.doingHere) return false;          // (your own doings — a drink, say — are done here, by you)
      this.lastUse = it;
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
      const inc = {};
      for (const k of Object.keys(town.S)) {
        if (k[0] === "_" || k === "buildings" || k === "felled" || k === "logs") continue;
        const j = JSON.stringify(town.S[k]); if (j === this.hostJSON[k]) continue;
        // (a count — logs on the stack, stone, coin — sent as how much it changed by, so it adds to theirs)
        const was = this.hostJSON[k] != null ? JSON.parse(this.hostJSON[k]) : null;
        if (typeof town.S[k] === "number" && typeof was === "number") inc[k] = town.S[k] - was; else d[k] = JSON.parse(j);
        this.hostJSON[k] = j;
      }
      if (Object.keys(d).length || Object.keys(inc).length) this.send("set", { d, inc });
    };
    // the bed: you lie down here, and the host's game is told; the night passes when everyone is down
    this.w.onSleep = { label: "Go to bed — the night passes when everyone has", local: true, can: () => this.night() && !this.inBed,
      use: () => { this.lieDown(); this.send("bed"); } };
    this.bedroll(this.w, () => { this.lieDown(true); this.send("bed"); });
    this.bedChanged = down => { if (!down) this.send("unbed"); };
    // furnishing the cabin is the host's to do
    town.furnish = () => UI.hint("Furnishing the cabin is for the colony's host.", 3);
  }
  // what the host's game said back
  said(m) {
    // (a screen to open: opened here, from the same thing, by your own game)
    if (m.local && this.lastUse) { const it = this.lastUse; this.lastUse = null; this.doingHere = true; try { it.use(); } catch (e) { console.warn("colony: couldn't open that here", e); } finally { this.doingHere = false; } }
    for (const t of m.said || []) UI.hint(t, 4);
    if (Array.isArray(m.pack) && G.pack) G.pack.splice(0, G.pack.length, ...m.pack);
    if (m.work) G.working = { kind: m.work.kind, until: G.time + m.work.secs };
    G.player.carryN = m.carry || 0; UI.carry(G.player.carryN ? `Carrying ${G.player.carryN} log${G.player.carryN > 1 ? "s" : ""}` : null); }
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
  tick(dt) {
    if (G.mp !== this || !this.ready) return; this.sendSelf(dt);
    // (down, or up again: the raiders leave you be while you're down)
    if (!!G.downed !== !!this.wasDown) { this.wasDown = !!G.downed; this.send("downed", { on: this.wasDown }); }
    // the board: the colony's season and its want, as the host sees it, and under it what you yourself might do
    if ((this.objT = (this.objT || 0) - dt) <= 0) {
      this.objT = 0.5;
      const t = this.town; let adv = ""; try { adv = t.advice ? t.advice() : ""; } catch (e) {}
      UI.objective(`${t.S.name || "The colony"} — ${t.season || ""}, day ${(t.day || 0) + 1}${adv ? ` · ${adv}` : ""}\nYou: ${this.nextForYou()}`);
    }
  }
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
