// ===========================================================================
//  FORESTER: RECKONING — Copyright (c) 2026 Roan Fraese / DeadlyDog Productions
// ===========================================================================

// A MULTIPLAYER GAME, PLAYED: the others about you, moving as they move; felling and quarrying; building a homestead;
// fighting, or standing together; talking. The server has the last word on all of it (see server/mpserver.cjs); this
// shows it, and asks.

import { THREE, clamp } from "../core.js";
import { G, Actor, setWorld, blendAtmo, input } from "../engine.js";
import { UI, $ } from "../ui.js";
import { AUDIO } from "../audio.js";
import { FOLEY } from "../foley.js";
import { makeAxe, makePick, makeTorch, makeSpade, makeSickle, makeSack } from "../models.js";
import { blowLands } from "../fight.js";
import { resetForMode } from "../story.js";
import { Wilds } from "./wilds.js";
import { BUILD, BUILD_ORDER, MAX_HP, MODES, SPAWN_SHIELD_MS, JOB_NAME, WAR } from "./rules.js";
import { TERRAINS } from "./terrain.js";
import { lookOpts, isF } from "./look.js";
import { Net } from "./net.js";

/* global SFX */
const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const sfx = (n, ...a) => { try { if (typeof SFX !== "undefined" && SFX[n]) SFX[n](...a); } catch (e) {} };

// the hours of the day, as the sky goes through them
const DAY = [[0, "night"], [0.2, "dawn"], [0.27, "morning"], [0.5, "afternoon"], [0.68, "evening"], [0.76, "dusk"], [0.84, "night"], [1, "night"]];

// a name over someone's head
// THE BOARD, in Frontier: what to do next with a homestead, one thing after another, each with how far along it is
const MP_GOALS = [
  { text: g => `Fell trees for logs — ${Math.min(10, g.stock.wood)} of 10 (swing the axe at a tree)`, done: g => g.stock.wood >= 10 || g.has("hearth") },
  { text: () => "Raise a hearth (B): the ground round it becomes yours, and you wake there after a fall", done: g => g.has("hearth") },
  { text: () => "Build a cabin (B): beds for two settlers, who'll come to live and work for you", done: g => g.has("cabin") || g.has("house") },
  { text: () => "Wait for your first settler to come up — keep felling meanwhile", done: g => g.mine() >= 1 },
  { text: () => "Lay out a field (B): settlers eat, and with no food they won't stay", done: g => g.has("field") },
  { text: () => "Build a woodshed (B) to keep your logs and stone", done: g => g.has("shed") },
  { text: g => `Break stone from the grey rocks — ${Math.min(10, g.stock.stone)} of 10`, done: g => g.stock.stone >= 10 || g.has("well") || g.has("tower") || g.has("house") },
  { text: () => "Put up a palisade (B) round your ground, with a gate in it", done: g => g.has("wall") && g.has("gate") },
  { text: () => "Raise a watchtower (B): two of your settlers keep watch", done: g => g.has("tower") },
  { text: g => `Grow your homestead to six settlers — ${g.mine()} of 6 (more beds: cabins and houses)`, done: g => g.mine() >= 6 },
  { text: () => "Build a forge (B): your axe bites deeper — trees fall and walls break sooner", done: g => g.has("forge") },
  { text: () => "Make an alliance (Tab) — or claim a rival's ground in a war", done: g => g.mode === "coop" || !!g.groupOf(g.pid) || (g.wars || []).some(w => w.att === g.pid || w.def === g.pid) },
  { text: g => `A full homestead: twelve settlers — ${g.mine()} of 12`, done: g => g.mine() >= 12 },
];
// what's in a sack, said
const goodsText = g => g ? [g.wood && `${g.wood} log${g.wood > 1 ? "s" : ""}`, g.stone && `${g.stone} stone`, g.food && `${g.food} food`].filter(Boolean).join(", ") || "nothing" : "nothing";
export function nameTag(text, colour) {
  const cv = document.createElement("canvas"), c = cv.getContext("2d"), f = "600 34px 'Open Sans', sans-serif";
  c.font = f; const w = Math.ceil(c.measureText(text).width) + 28; cv.width = w; cv.height = 52;
  c.font = f; c.fillStyle = "rgba(8,16,10,0.55)"; c.beginPath(); c.roundRect ? c.roundRect(0, 4, w, 44, 10) : c.rect(0, 4, w, 44); c.fill();
  c.fillStyle = colour; c.textAlign = "center"; c.textBaseline = "middle"; c.fillText(text, w / 2, 27);
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthWrite: false, transparent: true, fog: false }));
  sp.scale.set(w / 52 * 0.26, 0.26, 1); sp.renderOrder = 5;
  return sp;
}

// someone else, as they're seen here: their body, where the server last said they were, eased toward it
export class Remote {
  constructor(game, p) {
    this.game = game; this.pid = p.pid; this.name = p.name; this.look = p.look || {};
    const a = this.actor = new Actor(lookOpts(this.look, p.name), p.x, p.z, (p.yaw || 0) + Math.PI);
    a.remote = this; a.friendly = false;
    this.tx = p.x; this.ty = p.y; this.tz = p.z; this.tyaw = (p.yaw || 0) + Math.PI; this.anim = "idle"; this.spd = 0;
    this.x = p.x; this.z = p.z; this.dead = !!p.dead; this.hp = p.hp ?? MAX_HP;
    a.hold(makeAxe());
    a.update = dt => this.update(dt);
    this.setTag();
  }
  setTag() {
    if (this.tag) { this.actor.root.remove(this.tag); this.tag.material.map.dispose(); this.tag.material.dispose(); }
    const fr = this.game.friendly(this.pid);
    this.actor.friendly = fr; this.actor.isSibling = fr;
    this.tag = nameTag(this.name, fr ? "#9fe08f" : this.game.mode === "pvp" ? "#f0a090" : "#f3e7c6");
    this.tag.position.y = 2.15; this.actor.root.add(this.tag);
  }
  set(l) { [, this.tx, this.ty, this.tz, this.tyaw, this.anim, , this.spd, this.guard] = l; this.tyaw += Math.PI; }
  update(dt) {
    const a = this.actor, k = Math.min(1, dt * 9);
    a.pos.x += (this.tx - a.pos.x) * k; a.pos.z += (this.tz - a.pos.z) * k;
    const d = Math.atan2(Math.sin(this.tyaw - a.yaw), Math.cos(this.tyaw - a.yaw)); a.yaw += d * k;
    this.x = a.pos.x; this.z = a.pos.z;
    a.lying = this.dead; a.lieK = this.dead ? Math.min(1, (a.lieK || 0) + dt * 2) : Math.max(0, (a.lieK || 0) - dt * 3);
    a.speed = this.dead ? 0 : this.spd;
    a.person.fight = !!this.guard;
    a.person.setPose(this.dead ? "idle" : this.anim === "chop" ? "chop" : this.anim === "hammer" ? "hammer" : "idle");
    a.person.update(dt, a.speed);
    a.sync();
    // (swimming, or up a tower: the height they're at, not the ground's)
    const gy = G.world.heightAt(a.pos.x, a.pos.z);
    a.root.position.y += ((this.ty ?? gy) - gy > 0.3 || gy < 0 ? (this.ty - gy) : 0);
    const far = Math.hypot(a.pos.x - G.player.pos.x, a.pos.z - G.player.pos.z);
    this.tag.visible = far < 45 && !this.dead;
  }
  remove() { if (this.tag) { this.tag.material.map.dispose(); this.tag.material.dispose(); } this.actor.remove(); }
}

// one of the settlers: the server walks them about and sets them to work; this shows them
const SAYS = {
  wood: ["Good timber round here.", "Another one for the stack.", "Mind your feet — it'll come down where it likes."],
  stone: ["Stone takes its time.", "This one's got a seam in it.", "Hard work, but it'll stand a hundred years."],
  watch: ["All quiet.", "I'd know a stranger by his walk.", "Nobody comes onto this ground I don't see."],
  farm: ["Good soil, this. Keep the birds off it and it'll feed us.", "Rye's coming on.", "A field never thanks you, but it feeds you."],
};
class SettlerView {
  constructor(game, v) {
    this.game = game; this.id = v.id; this.owner = v.owner; this.name = v.name; this.job = v.job;
    const a = this.actor = new Actor(lookOpts(v.look, v.name), v.x, v.z, v.yaw || 0);
    a.settlerView = this; a.update = dt => this.update(dt);
    this.tx = v.x; this.tz = v.z; this.tyaw = v.yaw || 0; this.anim = v.a || "idle"; this.spd = 0; this.x = v.x; this.z = v.z; this.hp = v.hp;
    this.tool(); this.setTag();
    this.it = game.w.addInteract({ x: 0, y: 1.4, z: 0, reach: 2.6, can: () => this.anim !== "sleep" && !this.dying, label: () => `Talk to ${this.name}, ${this.owned() ? "" : this.game.nameOf(this.owner) + "'s "}${JOB_NAME[this.job]}`,
      use: () => { const l = SAYS[this.job] || SAYS.wood; UI.bark ? UI.bark(this.name, l[Math.floor(Math.random() * l.length)], 3) : UI.hint(`${this.name}: ${l[0]}`, 3); } });
  }
  owned() { return this.owner === "colony" || this.owner === this.game.pid; }
  tool() {
    const p = this.actor.person; if (this.held) p.held.remove(this.held);
    // (a watchman after dark carries a torch)
    this.torch = this.job === "watch" && this.game.isNight();
    this.held = this.actor.hold(this.torch ? makeTorch(true) : this.job === "stone" ? makePick() : this.job === "farm" ? (this.anim === "reap" ? makeSickle() : makeSpade()) : makeAxe());
  }
  setTag() {
    if (this.tag) { this.actor.root.remove(this.tag); this.tag.material.map.dispose(); this.tag.material.dispose(); }
    const fr = this.game.friendly(this.owner === "colony" ? this.game.pid : this.owner);
    this.actor.friendly = fr; this.actor.isSibling = false;
    this.tag = nameTag(`${this.name} · ${JOB_NAME[this.job]}`, fr ? "#cfe8c8" : "#f0b0a0");
    this.tag.scale.multiplyScalar(0.75); this.tag.position.y = 2.05; this.actor.root.add(this.tag);
  }
  update(dt) {
    const a = this.actor, k = Math.min(1, dt * 6);
    a.pos.x += (this.tx - a.pos.x) * k; a.pos.z += (this.tz - a.pos.z) * k;
    a.yaw += Math.atan2(Math.sin(this.tyaw - a.yaw), Math.cos(this.tyaw - a.yaw)) * Math.min(1, dt * 8);
    this.x = a.pos.x; this.z = a.pos.z;
    a.speed = this.dying ? 0 : this.spd;
    a.lying = !!this.dying; a.lieK = this.dying ? Math.min(1, (a.lieK || 0) + dt * 2) : 0;
    a.person.fight = this.job === "watch" && this.anim === "chop";
    const asleep = this.anim === "sleep";
    a.root.visible = !asleep;
    if ((this.toolT = (this.toolT || 0) - dt) <= 0) { this.toolT = 2; if (this.job === "watch" && this.torch !== this.game.isNight()) this.tool(); }
    if (this.job === "farm" && (this.anim === "reap") !== !!this.sickle) { this.sickle = this.anim === "reap"; this.tool(); }
    a.person.setPose(this.dying ? "idle" : ["chop", "dig", "reap"].includes(this.anim) && !(this.spd > 0.2) ? this.anim : this.torch ? "torch" : "idle");
    a.person.update(dt, a.speed);
    a.sync();
    if (this.it) { this.it.x = a.pos.x; this.it.z = a.pos.z; this.it.y = a.pos.y + 1.4; }
    this.tag.visible = !this.dying && !asleep && Math.hypot(a.pos.x - G.player.pos.x, a.pos.z - G.player.pos.z) < 16;
  }
  remove() { if (this.it) this.game.w.removeInteract(this.it); if (this.tag) { this.tag.material.map.dispose(); this.tag.material.dispose(); } this.actor.remove(); }
}

export class MPGame {
  constructor(net, inMsg, me, target, hooks) {
    this.net = net; this.me = me; this.target = target; this.hooks = hooks;
    const r = inMsg.room;
    this.room = r; this.mode = r.mode; this.pid = inMsg.you.pid;
    this.remotes = new Map(); this.settlers = new Map();
    this.groups = inMsg.groups || {};
    this.online = new Set(inMsg.online || []);
    this.owners = {};                     // pid → name, as heard
    this.stock = { wood: inMsg.you.wood, stone: inMsg.you.stone, food: inMsg.you.food | 0 };
    this.hp = MAX_HP; this.dead = false;
    this.shieldUntil = performance.now() + (inMsg.you.shield || SPAWN_SHIELD_MS);
    this.dayAt = performance.now() - inMsg.day.t; this.dayLen = inMsg.day.len;
    this.build = null; this.sendT = 0; this.atmoT = 0; this.lastHurt = -1e9;
    this.chatLines = [];
    this.wars = inMsg.wars || []; this.news = inMsg.news || [];
    // ---- the world ----
    resetForMode();
    G.mp = this;
    G.who = isF(me.look) ? "sister" : "brother";
    const w = this.w = new Wilds({ seed: r.seed, half: r.half, kind: r.kind });
    w.title = r.persistent ? "The Wide World" : r.name;
    setWorld(w);
    const pl = G.player;
    pl.setModel(lookOpts(me.look, me.name)); pl.model.scaleBase = me.look.height || 1;
    pl.giveAxe(true); pl.blade = "axe"; pl.showBow(false); pl.hasBow = false; pl.crouched = false; pl.seated = false; pl.frozen = false; pl.carryN = 0;
    pl.place(inMsg.you.x, inMsg.you.z, Math.random() * 6.28);
    w.buildNear(pl.pos.x, pl.pos.z, 99);
    this.unstick();
    G.hasMap = true;
    w.setFelled(inMsg.felled || []); w.setBroken(inMsg.broken || []);
    for (const p of inMsg.players || []) this.addRemote(p);
    for (const b of inMsg.buildings || []) this.addB(b);
    this.drops = new Map(); for (const d of inMsg.drops || []) this.addDrop(d);
    for (const v of inMsg.settlers || []) this.settlers.set(v.id, new SettlerView(this, v));
    for (const c of inMsg.chat || []) this.chatLine(c, true);
    G.onSwing = () => this.swing();
    G.onFrame.push(dt => this.tick(dt));
    G.achEvent && (G.achEvent("mp-join"), r.persistent && G.achEvent("mp-world"), target && target.host && G.achEvent("mp-host"));
    this.listen();
    this.hud(true); this.banner(null);
    this.atmo(true);
    UI.fade(0, 1.2);
    // hosting from this computer: how the others find it
    if (target && target.addr && target.addr.lan) {
      const L = target.addr.lan, a = L.addresses.map(x => `${x}:${L.port}`).join(" or ");
      this.chatLine({ name: "", text: `You're hosting. Friends on your network will find this game in their list${a ? ` (or join by the address ${a})` : ""}. Over the internet, they need your router to pass port ${L.port} on to this computer.` });
    }
    AUDIO.music && AUDIO.music("settlement");
    const kind = TERRAINS[r.kind] ? TERRAINS[r.kind].name.toLowerCase() : "island";
    UI.hint(r.persistent ? "The wide world. Build a hearth (B) to make a homestead of your own — while you're away, nothing of yours can be broken."
      : `${r.mode === "coop" ? "Co-op: one colony, one store for everyone" : "Classic: your own nation"} — on ${kind === "island" ? "an island" : kind === "archipelago" ? "an archipelago" : kind === "continent" ? "a continent" : kind === "highlands" ? "the highlands" : "lake country"}. Fell trees for logs (click), B to build${r.mode === "coop" ? " (start with the hearth)" : " — your hearth first, it claims the ground"}, Enter to talk${r.mode === "pvp" ? ", Tab to make allies" : ""}.`, 9);
  }
  // ---- who's who ----
  groupOf(pid) { for (const [id, g] of Object.entries(this.groups)) if (g.members.includes(pid)) return id; return null; }
  friendly(pid) { if (pid === this.pid || this.mode === "coop") return true; const a = this.groupOf(pid); return !!a && a === this.groupOf(this.pid); }
  nameOf(pid) { if (pid === this.pid) return this.me.name; const sv = this.settlers && this.settlers.get(pid); if (sv) return `${sv.name} (${JOB_NAME[sv.job]})`; const r = this.remotes.get(pid); return r ? r.name : this.owners[pid] || "someone"; }
  addRemote(p) {
    if (p.pid === this.pid || this.remotes.has(p.pid)) return;
    this.owners[p.pid] = p.name;
    this.remotes.set(p.pid, new Remote(this, p));
    this.hudCount();
  }
  addB(b) {
    const own = b.owner === this.pid, fr = this.friendly(b.owner);
    const r = this.remotes.get(b.owner);
    b.colour = r ? (r.look.coat ?? 0x7a2a22) : own ? (this.me.look.coat ?? 0x7a2a22) : 0x7a2a22;
    const e = this.w.addBuilding(b, own, fr); if (!e) return;
    e.mine = own; e.friendly = fr; e.ownerName = own ? this.me.name : this.nameOf(b.owner);
    e.mapColour = own ? "#2e6a40" : fr ? "#3a5a8a" : "#9a2e22";
    this.w.setGateFriendly(b.id, fr);
    // what you see when you look at it
    const d = BUILD[b.type];
    e.it = this.w.addInteract({ x: b.x, y: this.w.heightAt(b.x, b.z) + 1.2, z: b.z, reach: (d.wall ? d.len / 2 : d.r) + 2.2,
      label: () => {
        const whose = e.mine ? "Your" : `${esc(e.ownerName)}'s`;
        if (b.type === "tower") return `${whose} watchtower — F to climb`;
        if (b.type === "market" && e.friendly) return `${whose} market — F: 4 logs for a stone · hold F: a stone for 3 logs`;
        if (e.mine) return `Your ${d.name.toLowerCase()} — swing at it to take it down (most of it back)`;
        if (e.friendly || this.mode === "coop") return `${whose} ${d.name.toLowerCase()}`;
        return `${whose} ${d.name.toLowerCase()}${this.online.has(b.owner) ? " — swing to break it" : " (they're away: it can't be broken)"}`;
      },
      use: () => {
        if (b.type === "tower") { const t = (this.w.towers || []).find(q => q.id === b.id); if (!t) return; const pl = G.player; if (pl.pos.y > t.top - 1) { pl.place(b.x + Math.sin(b.ry || 0) * 2.2, b.z + Math.cos(b.ry || 0) * 2.2, pl.yaw); } else { pl.pos.set(b.x, t.top, b.z); pl.vy = 0; } sfx("build"); }
        else if (b.type === "market" && e.friendly) this.net.send({ t: "trade", want: "stone" });
      } });
    if (b.type === "market") e.it2 = this.w.addInteract({ x: b.x, y: this.w.heightAt(b.x, b.z) + 1.2, z: b.z, reach: d.r + 2.2, hold: 1.2, can: () => e.friendly && this.stock.stone > 0 && input.down("ShiftLeft"), label: "Hold F: a stone for 3 logs", use: () => this.net.send({ t: "trade", want: "wood" }) });
  }
  removeBNow(id) { const e = this.w.blds.get(id); if (!e) return; if (e.it) this.w.removeInteract(e.it); if (e.it2) this.w.removeInteract(e.it2); this.w.blds.delete(id); for (const c of e.cols) this.w.col.remove(c); if (this.w.towers) this.w.towers = this.w.towers.filter(t => t.id !== id); if (e.g.userData.flame) { const i = this.w.flames.indexOf(e.g.userData.flame); if (i >= 0) this.w.flames.splice(i, 1); } this.w.root.remove(e.g); }
  removeB(id) { const e = this.w.blds.get(id); if (!e) return; if (e.it) this.w.removeInteract(e.it); if (e.it2) this.w.removeInteract(e.it2); this.w.removeBuilding(id); }
  // ---- what the server says ----
  listen() {
    const n = this.net.on, w = this.w;
    n.ps = m => { for (const l of m.l) { const r = this.remotes.get(l[0]); if (r) r.set(l); } };
    n.pj = m => { this.online.add(m.p.pid); this.addRemote(m.p); this.refreshFriends(); };
    n.pl = m => { this.online.delete(m.pid); const r = this.remotes.get(m.pid); if (r) { r.remove(); this.remotes.delete(m.pid); } this.hudCount(); this.refreshFriends(); };
    n.stock = m => { const fed = (m.food | 0) > (this.stock.food | 0) + 4; this.stock = { wood: m.wood, stone: m.stone, food: m.food | 0 }; this.hudStock(true); if (fed && this.settlers.size) this.toast(`Harvest in: ${m.food} food in the store`); };
    n.bg = m => { const e = this.w.blds.get(m.id); if (e) { e.b.growth = m.growth; this.w.setGrowth(e.b, e.g, m.growth); } };
    n.chip = m => { const t = w.thing(m.id); if (!t) return; const r = this.remotes.get(m.by); if (t.id[0] === "r") { AUDIO.clang && AUDIO.clang(0.25, { x: t.x, y: t.y + 0.5, z: t.z }); } else if (r && Math.hypot(t.x - G.player.pos.x, t.z - G.player.pos.z) < 30) G.woodChips && G.woodChips(t, 0.6); };
    n.fell = m => {
      const t = w.fell(m.id, m.dx, m.dz); if (!t) return;
      FOLEY.fellStart({ x: t.x, z: t.z });
      G.startleBirds && G.startleBirds(t.x, t.z);
      const f = w.falling[w.falling.length - 1];
      if (f) f.onDown = () => { const r = (t.h || 9) * 0.5; FOLEY.crash(1, { x: t.x + f.dir.x * r, z: t.z + f.dir.z * r }); };
      if (m.by === this.pid) { G.woodChips && G.woodChips(t, 2.2); this.toast(`+${{ birch: 3 }[t.kind] || 5} logs`); }
      else if (Math.hypot(t.x - G.player.pos.x, t.z - G.player.pos.z) < 30) G.woodChips && G.woodChips(t, 1.4);
    };
    n.rock = m => { const k = w.thing(m.id); if (k) { w.broken.add(m.id); w.hideRock(k); if (Math.hypot(k.x - G.player.pos.x, k.z - G.player.pos.z) < 40) { G.rockChips && G.rockChips(k, 2); FOLEY.crash(0.35, { x: k.x, z: k.z }); } } else w.broken.add(m.id); if (m.by === this.pid) this.toast("+4 stone"); };
    n.grow = m => { for (const id of m.trees || []) w.showTree(id); for (const id of m.rocks || []) w.showRock(id); };
    n.b = m => { this.owners[m.b.owner] ??= this.nameOf(m.b.owner); this.addB(m.b); if (Math.hypot(m.b.x - G.player.pos.x, m.b.z - G.player.pos.z) < 40) sfx("build"); };
    n.bhp = m => { w.hitBuilding(m.id, m.hp); const e = w.blds.get(m.id); if (e && Math.hypot(e.b.x - G.player.pos.x, e.b.z - G.player.pos.z) < 40) { sfx("chop"); if (e.mine) this.warn(`${this.nameOf(m.by)} is breaking your ${BUILD[e.b.type].name.toLowerCase()}!`); } };
    n.bx = m => {
      const e = w.blds.get(m.id); const mine = e && e.mine;
      if (e) FOLEY.crash(0.8, { x: e.b.x, z: e.b.z });
      this.removeB(m.id);
      if (m.by === this.pid && m.got && (m.got.wood || m.got.stone)) this.toast(`Plundered ${[m.got.wood && `${m.got.wood} logs`, m.got.stone && `${m.got.stone} stone`].filter(Boolean).join(" and ")}`);
      else if (mine && m.by !== this.pid) this.warn(`${this.nameOf(m.by)} broke your ${BUILD[e.b.type].name.toLowerCase()}.`);
    };
    n.hp = m => {
      if (m.pid === this.pid) {
        const was = this.hp; this.hp = m.hp;
        if (m.hp < was && !m.heal) {
          const dmg = was - m.hp; this.lastHurt = performance.now();
          UI.hurt(Math.min(1, 0.45 + dmg / 25)); G.hitShake = Math.min(1.2, (G.hitShake || 0) + 0.5 + dmg / 20); G.panting = Math.max(G.panting || 0, 5);
          AUDIO.voice && AUDIO.voice(dmg > 9 ? "pain" : "grunt", { high: G.who === "sister", vol: 0.8 });
          if (m.guarded) AUDIO.clang && AUDIO.clang(0.6);
        }
        return;
      }
      const r = this.remotes.get(m.pid); if (!r) return;
      if (m.hp < r.hp && !m.heal) { blowLands(r.actor, m.guarded ? "parried" : "hit", m.by === this.pid ? G.player : (this.remotes.get(m.by) || {}).actor); r.actor.person.flinch && r.actor.person.flinch(); if (m.by !== this.pid) sfx("chop"); }
      r.hp = m.hp;
    };
    n.drop = m => this.addDrop(m.d);
    n.dropgone = m => {
      const e = this.drops.get(m.id); if (!e) return;
      this.w.root.remove(e.mesh); this.w.removeInteract(e.it); this.drops.delete(m.id);
      if (m.by === this.pid) { this.toast(`You take ${goodsText(m.d)}${m.d && m.d.owner === this.pid ? " — back again" : ` from ${m.d ? m.d.name : "the"}'s sack`}.`); sfx("pickup"); G.achEvent && m.d && m.d.owner !== this.pid && G.achEvent("mp-loot"); }
    };
    n.die = m => {
      const loot = m.dropped ? ` — ${goodsText(m.dropped)} spilled from their pack` : "";
      if (m.pid === this.pid) {
        this.dead = true; this.hp = 0; G.downed = true; G.lockMove = true;
        UI.fade(1, 1.4);
        this.banner(`You fell to ${esc(this.nameOf(m.by))}.`, `${m.dropped ? `A third of what you carried — ${esc(goodsText(m.dropped))} — lies in a sack where you fell, for whoever gets there first.` : "You had nothing worth taking."} You'll wake ${this.myHearth() ? "at your hearth" : "somewhere safe"} in a moment.`);
        return;
      }
      const r = this.remotes.get(m.pid); if (r) { r.dead = true; blowLands(r.actor, "down", m.by === this.pid ? G.player : null); }
      if (m.by === this.pid) G.achEvent && G.achEvent("mp-kill");
      if (m.by === this.pid) this.toast(`${this.nameOf(m.pid)} is down${loot}${m.dropped ? ". Loot the sack (F) before someone else does." : "."}`);
      else this.chatLine({ name: "", text: `${this.nameOf(m.pid)} fell to ${this.nameOf(m.by)}.` });
    };
    n.spawn = m => {
      if (m.pid === this.pid) {
        this.dead = false; this.hp = m.hp; G.downed = false; G.lockMove = false; G.health = 1;
        G.player.place(m.x, m.z, G.player.yaw); this.w.buildNear(m.x, m.z, 99); this.unstick();
        this.banner(null); UI.fade(0, 1.2); this.shieldUntil = performance.now() + 10000;
        return;
      }
      const r = this.remotes.get(m.pid); if (r) { r.dead = false; r.hp = m.hp; r.tx = m.x; r.tz = m.z; r.actor.place(m.x, m.z); }
    };
    n.sj = m => { if (!this.settlers.has(m.s.id)) this.settlers.set(m.s.id, new SettlerView(this, m.s)); if ([...this.settlers.values()].filter(v => v.owned()).length >= 12) G.achEvent && G.achEvent("mp-settlers-12"); };
    n.sx = m => {
      const v = this.settlers.get(m.id); if (!v) return;
      this.settlers.delete(m.id);
      if (m.dead) { v.dying = true; blowLands(v.actor, "down", m.by === this.pid ? G.player : null); if (m.by === this.pid) this.toast(`${v.name} is dead.`); setTimeout(() => v.remove(), 4000); }
      else v.remove();
    };
    n.ss = m => { for (const [id, x, z, yaw, a, sp] of m.l) { const v = this.settlers.get(id); if (v) { v.tx = x; v.tz = z; v.tyaw = yaw; v.anim = a; v.spd = sp; } } };
    n.sjob = m => { const v = this.settlers.get(m.id); if (v) { v.job = m.job; v.tool(); v.setTag(); } };
    n.sh = m => { const v = this.settlers.get(m.id); if (!v) return; blowLands(v.actor, "hit", m.by === this.pid ? G.player : null); v.actor.person.flinch && v.actor.person.flinch(); v.hp = m.hp; };
    n.wars = m => {
      const was = this.wars || []; this.wars = m.wars || []; this.drawWar();
      // (a war on your homestead over, and it's still yours: held)
      for (const w of was) if (w.def === this.pid && !this.wars.some(x => x.id === w.id) && this.hasHearth(this.pid)) G.achEvent && G.achEvent("mp-held");
    };
    n.warned = m => { this.warn(`${m.war.attName} has declared a claim war on your homestead! Hold your hearth — while they stand at it and none of yours do, it slips from you.`); AUDIO.music && AUDIO.music("battle"); };
    n.news = m => { this.news.push(m.n); if (this.news.length > 80) this.news.shift(); this.ticker(m.n); if (this.newsOpen) this.drawNews(); };
    n.bown = m => { const e = this.w.blds.get(m.id); if (!e) return; if (m.owner === this.pid && e.b.type === "hearth") G.achEvent && G.achEvent("mp-capture"); const b = { ...e.b, owner: m.owner }; this.removeBNow(m.id); this.addB(b); };
    n.sown = m => { const v = this.settlers.get(m.id); if (v) { v.owner = m.owner; v.setTag(); } };
    n.groups = m => { this.groups = m.groups || {}; if (this.groupOf(this.pid)) G.achEvent && G.achEvent("mp-ally"); this.refreshFriends(); if (this.listOpen) this.drawList(); };
    n.invite = m => this.invited(m);
    n.chat = m => this.chatLine(m);
    n.note = m => this.chatLine({ name: "", text: m.text });
    n.err = m => { UI.hint(m.text, 4); sfx("deny"); };
    n.lost = () => { if (G.mp !== this) return; this.reconnect(); };
  }
  refreshFriends() {
    for (const r of this.remotes.values()) r.setTag();
    for (const v of this.settlers.values()) v.setTag();
    for (const e of this.w.blds.values()) { const fr = this.friendly(e.b.owner); e.friendly = fr; e.mapColour = e.mine ? "#2e6a40" : fr ? "#3a5a8a" : "#9a2e22"; this.w.setGateFriendly(e.b.id, fr); }
    this.hudCount();
  }
  // (never brought in inside a tree or a rock: stepped out of it)
  unstick() { const p = G.player.pos; for (let i = 0; i < 6; i++) this.w.col.resolve(p, 0.7, p.y, 1.7); p.y = this.w.floorAt(p.x, p.z, p.y); }
  hasHearth(pid) { for (const e of this.w.blds.values()) if (e.b.type === "hearth" && e.b.owner === pid) return true; return false; }
  // the board: the first thing not yet done
  has(type) { for (const e of this.w.blds.values()) if (e.b.type === type && (e.mine || this.mode === "coop")) return true; return false; }
  mine() { let n = 0; for (const v of this.settlers.values()) if (v.owned && v.owned()) n++; return n; }
  goals() {
    let i = MP_GOALS.findIndex(q => { try { return !q.done(this); } catch (e) { return false; } });
    if (this.goalAt != null && i > this.goalAt) {
      const was = MP_GOALS[this.goalAt]; let t = ""; try { t = was.text(this).split(/ —| \(|:/)[0]; } catch (e) {}
      this.toast(`Done: ${t}.${i < 0 ? "" : " Next on the board."}`); window.__uisfx && window.__uisfx.done();
    }
    this.goalAt = i < 0 ? MP_GOALS.length : i;
    UI.objective(i < 0 ? "Your homestead stands, full. Hold it — and grow." : `${this.room.name} · ${MP_GOALS[i].text(this)}`);
  }
  myHearth() { for (const e of this.w.blds.values()) if (e.b.type === "hearth" && (e.mine || this.mode === "coop")) return e; return null; }
  // ---- your blow: at whoever or whatever is in front of you ----
  swing() {
    if (this.dead || this.build) return;
    const pl = G.player, p = pl.pos, f = pl.forward();
    const ahead = (x, z, reach) => { const dx = x - p.x, dz = z - p.z, d = Math.hypot(dx, dz); return d < reach && (d < 0.7 || (dx * f.x + dz * f.z) / d > 0.45) ? d : Infinity; };
    // a person
    let best = null, bd = Infinity;
    for (const r of this.remotes.values()) { if (r.dead) continue; const d = ahead(r.x, r.z, 2.8); if (d < bd) { bd = d; best = r; } }
    if (best) {
      if (this.mode === "coop") { UI.hint("Not in a game among friends.", 2); return; }
      if (this.friendly(best.pid)) { UI.hint(`${best.name} is your ally.`, 2); return; }
      this.net.send({ t: "hit", pid: best.pid }); G.impact && G.impact();
      return;
    }
    // someone's settler
    let sv = null; bd = Infinity;
    for (const v of this.settlers.values()) { if (v.dying) continue; const d = ahead(v.x, v.z, 2.6); if (d < bd) { bd = d; sv = v; } }
    if (sv) {
      if (sv.owned() || this.mode === "coop" || this.friendly(sv.owner)) { UI.hint(`${sv.name} works for ${sv.owned() ? "you" : this.nameOf(sv.owner)}.`, 2); return; }
      this.net.send({ t: "hits", id: sv.id }); G.impact && G.impact();
      return;
    }
    // something built
    let bb = null; bd = Infinity;
    for (const e of this.w.blds.values()) {
      const d = BUILD[e.b.type];
      let dist;
      if (d.wall) { const c = Math.cos(e.b.ry || 0), s = Math.sin(e.b.ry || 0), dx = p.x - e.b.x, dz = p.z - e.b.z, u = clamp(dx * c - dz * s, -d.len / 2, d.len / 2); dist = ahead(e.b.x + u * c, e.b.z - u * s, 2.6); }
      else dist = ahead(e.b.x, e.b.z, d.r + 2.2) - d.r;
      if (dist < bd) { bd = dist; bb = e; }
    }
    if (bb) {
      if (!bb.mine && (this.mode === "coop" || bb.friendly)) { UI.hint("That isn't yours to break.", 2); return; }
      sfx("chop"); G.impact && G.impact(); this.w.hitBuilding(bb.b.id, bb.hp);
      this.net.send({ t: "hitb", id: bb.b.id });
      return;
    }
    // a tree
    let tr = null; bd = Infinity;
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
      const ch = this.w.chunkAt(p.x + i * 3, p.z + j * 3); if (!ch) continue;
      for (const t of ch.trees) { if (t.gone || this.w.felled.has(t.id)) continue; const d = ahead(t.x, t.z, 2.6); if (d < bd) { bd = d; tr = t; } }
    }
    if (tr) {
      sfx("chop"); G.impact && G.impact(); G.woodChips && G.woodChips(tr, 1);
      this.net.send({ t: "chop", id: tr.id });
      return;
    }
    // a rock
    let rk = null; bd = Infinity;
    const ch = this.w.chunkAt(p.x, p.z);
    for (const c of [ch, this.w.chunkAt(p.x + 4, p.z), this.w.chunkAt(p.x - 4, p.z), this.w.chunkAt(p.x, p.z + 4), this.w.chunkAt(p.x, p.z - 4)]) if (c) for (const k of c.rocks) { if (k.gone) continue; const d = ahead(k.x, k.z, k.s + 2.2) - k.s; if (d < bd) { bd = d; rk = k; } }
    if (rk) {
      AUDIO.clang && AUDIO.clang(0.35, { x: rk.x, y: rk.y + 0.5, z: rk.z }); G.rockChips && G.rockChips(rk, 1); G.impact && G.impact();
      this.net.send({ t: "mine", id: rk.id });
    }
  }
  // ---- building ----
  openBuild(on) {
    this.menuOpen = on;
    $("mpBuild").classList.toggle("hidden", !on);
    if (!on) return;
    $("mpBuildList").innerHTML = BUILD_ORDER.map((k, i) => {
      const d = BUILD[k], ok = this.stock.wood >= d.wood && this.stock.stone >= d.stone, has = k === "hearth" && this.myHearth();
      return `<button class="plan" data-k="${k}" ${ok && !has ? "" : "disabled"}><span class="pk">${(i + 1) % 10}</span><span><b>${d.name}</b><span class="pd">${d.note}${has ? (this.mode === "coop" ? " (The colony has one.)" : " (You have one.)") : ""}</span></span><span class="pc">${d.wood} logs${d.stone ? `<br>${d.stone} stone` : ""}</span></button>`;
    }).join("");
    for (const b of $("mpBuildList").querySelectorAll("[data-k]")) b.onclick = () => this.startBuild(b.dataset.k);
  }
  startBuild(type) {
    this.openBuild(false);
    G.lockMouse && G.lockMouse();
    const d = BUILD[type]; if (!d) return;
    if (this.build) this.endBuild();
    const mat = new THREE.MeshBasicMaterial({ color: 0x5ac85a, transparent: true, opacity: 0.2, depthWrite: false });
    let geo;
    if (d.wall) geo = new THREE.BoxGeometry(d.len, 2.6, 0.4).translate(0, 1.3, 0);
    else if (type === "hearth") geo = new THREE.CylinderGeometry(0.85, 0.85, 0.5, 16).translate(0, 0.25, 0);
    else if (type === "tower") geo = new THREE.BoxGeometry(2.6, 6.4, 2.6).translate(0, 3.2, 0);
    else if (type === "well") geo = new THREE.CylinderGeometry(1.2, 1.2, 1.4, 14).translate(0, 0.7, 0);
    else geo = new THREE.BoxGeometry(d.w || 4, 3.2, d.d || 4).translate(0, 1.6, 0);
    const ghost = new THREE.Mesh(geo, mat);
    // (its edges drawn clear, so it reads as an outline of what will stand there and doesn't fill the view)
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geo), new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7 })); ghost.add(edges); ghost.userData.edges = edges;
    // the ground it will claim, for a hearth
    if (d.claim) { const ring = new THREE.Mesh(new THREE.RingGeometry(d.claim - 0.25, d.claim, 64).rotateX(-Math.PI / 2), mat); ring.position.y = 0.3; ghost.add(ring); }
    G.scene.add(ghost);
    this.build = { type, d, ghost, rot: 0, ok: false };
    G.onSwing = null;
    $("mpBuildBar").classList.remove("hidden");
  }
  endBuild() {
    if (!this.build) return;
    G.scene.remove(this.build.ghost); this.build.ghost.geometry.dispose();
    this.build = null; G.onSwing = () => this.swing();
    $("mpBuildBar").classList.add("hidden");
  }
  tickBuild() {
    const B = this.build, pl = G.player, d = B.d, f = pl.forward();
    const dist = d.wall ? 3.2 : (d.r || 1.5) + 3.6;
    const x = pl.pos.x + f.x * dist, z = pl.pos.z + f.z * dist;
    const step = d.wall ? Math.PI / 12 : Math.PI / 2;
    const ry = Math.round((pl.yaw + B.rot) / step) * step;
    const y = this.w.heightAt(x, z);
    B.ghost.position.set(x, y, z); B.ghost.rotation.y = ry;
    // will it do?
    let why = "";
    if (this.stock.wood < d.wood || this.stock.stone < d.stone) why = `Needs ${d.wood} logs${d.stone ? ` and ${d.stone} stone` : ""}`;
    else if (y < 0.6) why = "Not in the water";
    else if (Math.abs(x) > this.room.half - 10 || Math.abs(z) > this.room.half - 10) why = "The edge of the map";
    else {
      const r = d.wall ? d.len / 2 : d.r || 1.5;
      let lo = Infinity, hi = -Infinity; for (const [a, b] of [[r, 0], [-r, 0], [0, r], [0, -r], [0, 0]]) { const h = this.w.heightAt(x + a, z + b); lo = Math.min(lo, h); hi = Math.max(hi, h); }
      if (hi - lo > (d.wall ? 1.6 : 1.2)) why = "Too steep";
    }
    if (!why) for (const e of this.w.blds.values()) {
      const c = BUILD[e.b.type];
      if (c.claim && !e.friendly && Math.hypot(e.b.x - x, e.b.z - z) < c.claim) { why = `${e.ownerName}'s ground`; break; }
      if (B.type === "hearth" && c.claim && !e.friendly && Math.hypot(e.b.x - x, e.b.z - z) < c.claim + d.claim) { why = "Too near someone's homestead"; break; }
      const gap = (d.wall && c.wall) ? 1.2 : (d.wall ? 0.3 : d.r) + (c.wall ? 0.3 : c.r) - 0.2;
      if (Math.hypot(e.b.x - x, e.b.z - z) < gap) { why = "Something's in the way"; break; }
    }
    if (!why && B.type === "hearth" && this.myHearth()) why = this.mode === "coop" ? "The colony has its hearth" : "You have a hearth already";
    if (!why && !d.wall) for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) { const ch = this.w.chunkAt(x + i * 8, z + j * 8); if (ch) for (const t of ch.trees) if (!t.gone && Math.hypot(t.x - x, t.z - z) < (d.r || 1.5) * 0.8) why = "Fell the trees here first"; }
    B.ok = !why; B.x = x; B.z = z; B.ry = ry;
    B.ghost.material.color.set(B.ok ? 0x5ac85a : 0xd04a3a); B.ghost.userData.edges.material.color.set(B.ok ? 0xd8ffd0 : 0xffc0b0);
    $("mpBuildBar").innerHTML = `<b>${d.name}</b> — ${B.ok ? "click to build it here" : esc(why)} · R to turn · B or right-click to stop`;
    if (input.hit("KeyR")) B.rot += step;
    if (input.rclick) { this.endBuild(); return; }
    if (input.click && !UI.dialogOpen) {
      input.click = false;
      if (!B.ok) { sfx("deny"); return; }
      this.net.send({ t: "build", type: B.type, x: +x.toFixed(2), z: +z.toFixed(2), ry: +ry.toFixed(3) });
      G.working = { kind: "hammer", until: G.time + 0.6 };
      // (walls go up one after another; anything else, once)
      if (!d.wall) this.endBuild();
    }
  }
  // ---- every frame ----
  tick(dt) {
    const pl = G.player, now = performance.now();
    if ((this.goalT = (this.goalT || 0) - dt) <= 0) { this.goalT = 1; try { this.goals(); } catch (e) {} }
    // your health is the server's: no mending here but what it says, no hunger in these woods
    G.health = this.hp / MAX_HP; if (G.body) G.body.hunger = 1;
    if (this.build) this.tickBuild();
    // where you are, ten times a second
    if ((this.sendT -= dt) <= 0) {
      this.sendT = 0.1;
      const guard = !!(input.rdown && pl.axe && !this.build);
      this.net.send({ t: "st", x: +pl.pos.x.toFixed(2), y: +pl.pos.y.toFixed(2), z: +pl.pos.z.toFixed(2), yaw: +pl.yaw.toFixed(3), a: pl.swingT >= 0 ? "chop" : G.working && G.working.until > G.time && G.working.kind === "hammer" ? "hammer" : "idle", h: "axe", s: +(pl.speed || 0).toFixed(2), g: guard });
    }
    if ((this.atmoT -= dt) <= 0) { this.atmoT = 0.5; this.atmo(); this.drawWar(); }
    // spawn shield
    const sh = Math.max(0, this.shieldUntil - now);
    const el = $("mpShield"); el.classList.toggle("hidden", sh <= 0 || this.mode === "coop"); if (sh > 0) el.textContent = `Safe for ${Math.ceil(sh / 1000)} s — no one can hurt you yet`;
    // the music: a fight when you're hurt and someone hostile is near
    if ((this.musT = (this.musT || 0) - dt) <= 0) {
      this.musT = 3;
      const hostile = this.mode === "pvp" && [...this.remotes.values()].some(r => !r.dead && !this.friendly(r.pid) && Math.hypot(r.x - pl.pos.x, r.z - pl.pos.z) < 18);
      const f = this.dayFrac();
      AUDIO.music && AUDIO.music(hostile && now - this.lastHurt < 15000 ? "battle" : f < 0.2 || f > 0.84 ? "night" : f > 0.68 ? "evening" : "settlement");
    }
    if (this.toastT > 0 && (this.toastT -= dt) <= 0) $("mpToast").classList.add("hidden");
  }
  isNight() { const f = this.dayFrac(); return f > 0.86 || f < 0.21; }
  dayFrac() { return (((performance.now() - this.dayAt) % this.dayLen) + this.dayLen) % this.dayLen / this.dayLen; }
  atmo() {
    const f = this.dayFrac();
    for (let i = 0; i < DAY.length - 1; i++) {
      const [a, A] = DAY[i], [b, B] = DAY[i + 1];
      if (f >= a && f <= b) { blendAtmo(A, B, (f - a) / (b - a || 1)); break; }
    }
  }
  // ---- wars and news ----
  drawWar() {
    const el = $("mpWar"), p = G.player.pos;
    // the war that's yours, or the one being fought where you stand
    const w = this.wars.find(w => w.att === this.pid || w.def === this.pid) || this.wars.find(w => Math.hypot(w.x - p.x, w.z - p.z) < 60);
    if (!w) { el.classList.add("hidden"); return; }
    el.classList.remove("hidden");
    const mine = w.def === this.pid, left = Math.max(0, Math.ceil((WAR.lastsMs - (Date.now() - w.start)) / 60000));
    const at = Math.hypot(w.x - p.x, w.z - p.z) < WAR.radius;
    el.innerHTML = `<div class="wt">Claim war</div>${esc(w.attName)} against ${esc(w.defName)}'s homestead<div class="bar"><div style="width:${Math.round(w.progress * 100)}%"></div></div>`
      + `<div class="ws">${Math.round(w.progress * 100)}% taken · ${left} min left${at ? " · you're at the hearth" : ""}${mine ? " — stand at your hearth to win it back" : w.att === this.pid ? " — hold their hearth with none of theirs there" : ""}</div>`;
  }
  ticker(n) {
    const el = $("mpTicker"), K = { war: "War", capture: "Taken", ally: "Alliance", death: "A death", grow: "Growing" };
    el.innerHTML = `<b>${K[n.kind] || "News"}</b>${esc(n.text)}`; el.classList.remove("hidden");
    clearTimeout(this._tick); this._tick = setTimeout(() => el.classList.add("hidden"), 7000);
    if (n.kind === "war" || n.kind === "capture") sfx("deny");
  }
  drawNews() {
    const ago = at => { const m = Math.round((Date.now() - at) / 60000); return m < 1 ? "just now" : m < 60 ? `${m} min ago` : `${Math.round(m / 60)} h ago`; };
    const K = { war: "War", capture: "Taken", ally: "Alliance", death: "Death", grow: "Growing" };
    $("mpNewsBody").innerHTML = this.news.length ? this.news.slice().reverse().map(n => `<div class="nw"><span class="k">${K[n.kind] || "News"}</span>${esc(n.text)}<span class="w">${ago(n.at)}</span></div>`).join("") : `<p class="mc-hint">Nothing has happened yet that anyone's talking about.</p>`;
  }
  toggleNews(on = !this.newsOpen) { this.newsOpen = on; $("mpNews").classList.toggle("hidden", !on); if (on) { G.releaseMouse && G.releaseMouse(); this.drawNews(); } else G.lockMouse && G.lockMouse(); }
  // ---- the screen ----
  hud(on) {
    $("mpHud").classList.toggle("hidden", !on);
    document.body.classList.toggle("mp", on);
    if (!on) return;
    $("mpRoom").textContent = this.room.persistent ? "The Wide World" : this.room.name;
    $("mpMode").textContent = `${MODES[this.mode]} · ${TERRAINS[this.room.kind] ? TERRAINS[this.room.kind].name : ""}`;
    this.hudStock(); this.hudCount(); this.drawChat();
  }
  hudStock(flash) { $("mpLogs").textContent = this.stock.wood; $("mpStone").textContent = this.stock.stone; $("mpFood").textContent = this.stock.food | 0; $("mpStock").classList.toggle("hungry", (this.stock.food | 0) <= 0 && this.settlers.size > 0); if (flash) { const e = $("mpStock"); e.classList.remove("flash"); void e.offsetWidth; e.classList.add("flash"); } if (this.menuOpen) this.openBuild(true); }
  hudCount() { const n = this.remotes.size + 1; $("mpCount").textContent = `${n} ${n === 1 ? "person" : "people"} here`; }
  toast(text) { const e = $("mpToast"); e.textContent = text; e.classList.remove("hidden", "bad"); this.toastT = 2.6; }
  warn(text) { const e = $("mpToast"); e.textContent = text; e.classList.remove("hidden"); e.classList.add("bad"); this.toastT = 4; sfx("deny"); }
  banner(title, sub) { const e = $("mpDead"); if (!title) { e.classList.add("hidden"); return; } e.innerHTML = `<div class="t">${title}</div><div class="s">${sub || ""}</div>`; e.classList.remove("hidden"); }
  chatLine(c, old) {
    this.chatLines.push({ who: c.name, text: c.text, at: old ? 0 : performance.now(), to: c.to, mine: c.pid === this.pid });
    if (this.chatLines.length > 40) this.chatLines.shift();
    this.drawChat();
  }
  drawChat() {
    const typing = !$("mpChatIn").classList.contains("hidden");
    const lines = this.chatLines.slice(typing ? -12 : -6);
    $("mpChatLog").innerHTML = lines.map(l => `<div class="cl${l.who ? "" : " sys"}${l.to === "allies" ? " ally" : ""}">${l.who ? `<b>${esc(l.who)}${l.to === "allies" ? " (to allies)" : ""}:</b> ` : ""}${esc(l.text)}</div>`).join("");
    clearTimeout(this._chatFade); $("mpChat").classList.remove("quiet");
    if (!typing) this._chatFade = setTimeout(() => $("mpChat").classList.add("quiet"), 9000);
  }
  openChat() {
    const i = $("mpChatIn"); i.classList.remove("hidden"); i.value = ""; i.focus(); this.drawChat();
    i.onkeydown = e => {
      e.stopPropagation();
      if (e.key === "Enter") { const t = i.value.trim(); if (t) this.net.send({ t: "chat", text: t, allies: !!this.alliesOnly }); this.closeChat(); }
      else if (e.key === "Escape") this.closeChat();
      else if (e.key === "Tab") { e.preventDefault(); this.alliesOnly = !this.alliesOnly; i.placeholder = this.alliesOnly ? "To your allies only — Tab for everyone" : "Say something — Enter to send, Tab for allies only"; }
    };
  }
  closeChat() { const i = $("mpChatIn"); i.blur(); i.classList.add("hidden"); this.alliesOnly = false; this.drawChat(); }
  // who's here, and standing together
  toggleList(on = !this.listOpen) {
    this.listOpen = on; $("mpPlayers").classList.toggle("hidden", !on);
    if (on) { G.releaseMouse && G.releaseMouse(); this.drawList(); } else G.lockMouse && G.lockMouse();
  }
  drawList() {
    const mine = this.groupOf(this.pid), g = mine && this.groups[mine];
    const people = [{ pid: this.pid, name: this.me.name }, ...[...this.remotes.values()].map(r => ({ pid: r.pid, name: r.name }))];
    const near = pid => { const r = this.remotes.get(pid); return r && Math.hypot(r.x - G.player.pos.x, r.z - G.player.pos.z) < 6; };
    $("mpPlayersBody").innerHTML = `<div class="mc-sec">${this.mode === "coop" ? "Everyone here is on the same side" : g ? `Your alliance: ${esc(g.name)}` : "You stand alone"}</div>` +
      people.map(p => {
        const ally = p.pid !== this.pid && this.friendly(p.pid), grp = this.groupOf(p.pid);
        const acts = p.pid === this.pid ? (g && this.mode !== "coop" ? `<button data-a="unally">Leave the alliance</button>` : `<i>you</i>`)
          : [this.mode !== "coop" && !ally ? `<button data-a="ally" data-p="${p.pid}">Ask to be allies</button>` : "", this.mode === "pvp" && !ally && this.hasHearth(p.pid) && !this.wars.some(w => w.def === p.pid) ? `<button data-a="war" data-p="${p.pid}">Declare a claim war</button>` : "", near(p.pid) && this.stock.wood >= 10 ? `<button data-a="give" data-p="${p.pid}">Give 10 logs</button>` : ""].join("");
        return `<div class="mp-pl${ally ? " ally" : ""}"><span class="n">${esc(p.name)}</span><span class="g">${grp && this.groups[grp] ? esc(this.groups[grp].name) : ""}</span><span class="a">${acts}</span></div>`;
      }).join("") + `<p class="mc-hint">${this.mode === "pvp" ? "Allies can't hurt each other, share their gates, and can build on each other's ground. Up to eight to an alliance." : "In co-op no one can be hurt, and you can all build anywhere."}${this.room.persistent ? " In the wide world, a homestead can't be broken while its owner is away." : " Nothing of yours can be broken while you're away from the game."}</p>`;
    for (const b of $("mpPlayersBody").querySelectorAll("button[data-a]")) b.onclick = () => {
      const a = b.dataset.a, pid = b.dataset.p;
      if (a === "ally") this.net.send({ t: "ally", pid });
      else if (a === "unally") this.net.send({ t: "unally" });
      else if (a === "give") this.net.send({ t: "give", pid, wood: 10 });
      else if (a === "war") { if (b.classList.contains("armed")) { this.net.send({ t: "war", pid }); this.toggleList(false); } else { b.classList.add("armed"); b.textContent = "Click again: war"; } }
    };
  }
  invited(m) {
    const e = $("mpInvite");
    e.innerHTML = `<b>${esc(m.name)}</b> asks you to stand with them${m.group ? ` in ${esc(m.group)}` : ""}. <span class="k">Y</span> yes · <span class="k">N</span> no`;
    e.classList.remove("hidden"); this.invite = m; sfx("coin");
    clearTimeout(this._invT); this._invT = setTimeout(() => { e.classList.add("hidden"); this.invite = null; }, 30000);
  }
  // keys main.js passes on while a game is on; true if taken
  key(e) {
    if (e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return false;
    if (G.mode !== "play" || e.repeat) return ["Tab", "KeyB", "KeyT", "KeyP", "KeyG", "KeyH", "KeyV"].includes(e.code) && G.mode === "play";
    if (e.code === "Enter" || e.code === "KeyT") { e.preventDefault(); this.openChat(); return true; }
    if (e.code === "Tab") { e.preventDefault(); this.toggleList(); return true; }
    if (e.code === "KeyN" && !this.invite) { this.toggleNews(); return true; }
    if (e.code === "KeyB") { if (this.build) this.endBuild(); else { const on = !this.menuOpen; this.openBuild(on); if (on) G.releaseMouse && G.releaseMouse(); else G.lockMouse && G.lockMouse(); } return true; }
    if (this.menuOpen && /^Digit\d$/.test(e.code)) { const i = (+e.code.slice(5) + 9) % 10, k = BUILD_ORDER[i]; const d = BUILD[k]; if (k && this.stock.wood >= d.wood && this.stock.stone >= d.stone) this.startBuild(k); return true; }
    if (this.invite && (e.code === "KeyY" || e.code === "KeyN")) { this.net.send({ t: e.code === "KeyY" ? "allyok" : "allyno", pid: this.invite.pid }); $("mpInvite").classList.add("hidden"); this.invite = null; return true; }
    if (e.code === "Escape" && (this.menuOpen || this.listOpen || this.newsOpen)) { this.openBuild(false); this.toggleList(false); this.toggleNews(false); return true; }
    return ["KeyP", "KeyG", "KeyH", "KeyV"].includes(e.code);
  }
  // the line dropped: tried again a few times (back into the same game, where you were), then back to the lobby
  async reconnect() {
    if (this.reconnecting) return; this.reconnecting = true;
    this.banner("The connection dropped.", "Trying to get back in…");
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    for (let i = 0; i < 4 && G.mp === this; i++) {
      await sleep(1200 * (i + 1));
      const net = new Net(this.net.addr);
      try {
        await net.connect(this.me.name, this.me.look);
        const wait = net.next("in", 15000);
        net.send({ t: "join", room: this.room.id, password: this.target && this.target.password || "", name: this.me.name, look: this.me.look });
        const inMsg = await wait;
        if (G.mp !== this) { net.close(); return; }
        this.leave(true);
        new MPGame(net, inMsg, this.me, { addr: this.net.addr, room: this.room.id, password: this.target && this.target.password }, this.hooks);
        UI.hint("Back in.", 2);
        return;
      } catch (e) { net.close(); }
    }
    if (G.mp !== this) return;
    this.leave(true);
    this.hooks.lost && this.hooks.lost(this.room.persistent ? "The connection to the wide world was lost." : "The connection to the game was lost — its host may have closed it.");
  }
  // a fallen player's sack: where they fell, F to take what's in it
  addDrop(d) {
    if (!d || this.drops.has(d.id)) return;
    const mesh = new THREE.Group(), s1 = makeSack(), s2 = makeSack();
    s1.scale.setScalar(2.3); s2.scale.setScalar(1.7); s2.position.set(0.25, 0, 0.18); s2.rotation.z = 1.2; mesh.add(s1, s2);
    mesh.position.set(d.x, this.w.heightAt(d.x, d.z), d.z); mesh.rotation.y = (d.x * 7.3) % 6.28; this.w.root.add(mesh);
    const it = this.w.addInteract({ x: d.x, y: this.w.heightAt(d.x, d.z) + 0.4, z: d.z, reach: 2.6, can: () => !this.dead,
      label: () => `${d.owner === this.pid ? "Take back your sack" : `Loot ${d.name}'s sack`} — ${goodsText(d)}`, use: () => this.net.send({ t: "loot", id: d.id }) });
    this.drops.set(d.id, { d, mesh, it });
  }
  leave(quiet) {
    if (G.mp !== this) return;
    UI.objective(null);
    this.endBuild(); this.openBuild(false); this.toggleList(false); this.toggleNews(false); this.closeChat(); $("mpWar").classList.add("hidden"); $("mpTicker").classList.add("hidden");
    if (!quiet) { try { this.net.send({ t: "leave" }); } catch (e) {} }
    this.net.close();
    for (const r of this.remotes.values()) r.remove();
    this.remotes.clear();
    for (const v of this.settlers.values()) v.remove();
    this.settlers.clear();
    this.hud(false); this.banner(null); $("mpInvite").classList.add("hidden"); $("mpToast").classList.add("hidden");
    G.onSwing = null; G.onFrame.length = 0; G.downed = false; G.lockMove = false;
    G.mp = null;
  }
}
