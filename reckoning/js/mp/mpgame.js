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
import { makeAxe, makePick, makeTorch, makeSpade, makeSickle, makeSack, modelCopy, ensureModel, makeLogs, makeRowboat, makeShipyard, makeShip } from "../models.js";
import { blowLands } from "../fight.js";
import { resetForMode } from "../story.js";
import { siteSign } from "../town.js";
import { fishingGear } from "../fishing.js";
import { Hunt } from "../hunt.js";
import { WATER, BIOMES } from "./terrain.js";
import { waveAt } from "../water.js";
import { Wilds } from "./wilds.js";
import { BUILD, BUILD_ORDER, MAX_HP, MODES, SPAWN_SHIELD_MS, JOB_NAME, WAR, SHIP, BOATS } from "./rules.js";
import { TERRAINS } from "./terrain.js";
import { lookOpts, isF } from "./look.js";
import { Net, hostCommand } from "./net.js";

/* global SFX */
const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const sfx = (n, ...a) => { try { if (typeof SFX !== "undefined" && SFX[n]) SFX[n](...a); } catch (e) {} };

// the hours of the day, as the sky goes through them
const DAY = [[0, "night"], [0.2, "dawn"], [0.27, "morning"], [0.5, "afternoon"], [0.68, "evening"], [0.76, "dusk"], [0.84, "night"], [1, "night"]];

// a name over someone's head
// THE BOARD, in Frontier: what to do next with a homestead, one thing after another, each with how far along it is
// (each building: laid out, then its logs carried to the site and raised)
const lay = (g, what, why) => `Lay out ${what} (B), carry its logs to the site (F) and hold F to raise it: ${why}`;
const MP_GOALS = [
  { text: g => `Fell trees for logs — ${Math.min(10, g.stock.wood)} of 10 (swing the axe at a tree, take up its logs with F, stack them at the hearth)`, done: g => g.stock.wood >= 10 || g.has("hearth") },
  { text: () => "Raise a hearth (B): the ground round it becomes yours, and you wake there after a fall", done: g => g.has("hearth") },
  { text: g => lay(g, "a cabin", "beds for two settlers, who'll come through the woods to live and work"), done: g => g.has("cabin") || g.has("house") },
  { text: () => "Wait for your first settler to come through the woods — keep felling meanwhile", done: g => g.mine() >= 1 },
  { text: g => lay(g, "a field", "settlers eat, and with no food they won't stay"), done: g => g.has("field") },
  { text: g => lay(g, "a woodshed", "to keep the logs and stone"), done: g => g.has("shed") },
  { text: g => `Break stone from the grey rocks with the pickaxe (2) — ${Math.min(10, g.stock.stone)} of 10`, done: g => g.stock.stone >= 10 || g.has("well") || g.has("tower") || g.has("house") },
  { text: g => lay(g, "a palisade with a gate in it", "round your ground"), done: g => g.has("wall") && g.has("gate") },
  { text: g => lay(g, "a watchtower", "two of your settlers keep watch"), done: g => g.has("tower") },
  { text: g => `Grow your homestead to six settlers — ${g.mine()} of 6 (more beds: cabins and houses)`, done: g => g.mine() >= 6 },
  { text: g => lay(g, "a forge", "your axe bites deeper — trees fall and walls break sooner"), done: g => g.has("forge") },
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
    // (or down a cave, under the ground: there, out of sight of all but those down there too)
    a.root.position.y += ((this.ty ?? gy) - gy > 0.3 || gy < 0 || (this.ty ?? gy) < gy - 20 ? (this.ty - gy) : 0);
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
    this.game = game; this.id = v.id; this.owner = v.owner; this.name = v.name; this.job = v.job; this.pin = v.pin || null;
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
    pl.giveAxe(true); pl.blade = "axe"; pl.showBow(false);
    // (a bow and a quiver of arrows, for the beasts of the wild)
    pl.hasBow = true; pl.arrows = Math.max(pl.arrows || 0, 24); pl.crouched = false; pl.seated = false; pl.frozen = false; pl.carryN = 0;
    pl.place(inMsg.you.x, inMsg.you.z, Math.random() * 6.28);
    w.buildNear(pl.pos.x, pl.pos.z, 99);
    this.unstick();
    G.hasMap = true;
    w.setFelled(inMsg.felled || []); w.setBroken(inMsg.broken || []);
    for (const p of inMsg.players || []) this.addRemote(p);
    for (const b of inMsg.buildings || []) this.addB(b);
    this.drops = new Map(); for (const d of inMsg.drops || []) this.addDrop(d);
    this.piles = new Map(); for (const q of inMsg.piles || []) this.setPile(q);
    this.sites = new Map(); for (const q of inMsg.sites || []) this.setSite(q);
    this.boats = new Map(); this.aboard = null; for (const o of inMsg.boats || []) this.setBoat(o);
    w.sitesFor = () => this.sites.values();
    this.setCarry(inMsg.carry || 0);
    for (const v of inMsg.settlers || []) this.settlers.set(v.id, new SettlerView(this, v));
    for (const c of inMsg.chat || []) this.chatLine(c, true);
    G.onSwing = () => this.swing();
    // (a pickaxe for the rocks, as in the settlement: 2 to take it out)
    G.onMine = () => this.swing();
    if (G.body) G.body.tools.pick = Math.max(G.body.tools.pick || 0, 1);
    // fishing, at the lakes and the sea's edge: a rod of your own, as in the settlement; what you catch goes in your pack
    if (G.body) G.body.tools.rod = Math.max(G.body.tools.rod || 0, 1);
    {
      const fg = new THREE.Group(); w.root.add(fg);
      const wet = (x, z, k = 0.9) => w.land.heightAt(x, z) < WATER - (k > 0.92 ? 0.15 : 0.35);
      const rings = [];
      this.fish = fishingGear({ w, g: fg, t: 0, frozen: false, lvl: () => WATER - 0.05 + (this.fish && this.fish.float && w.wm ? waveAt(w.wm, this.fish.float.position.x, this.fish.float.position.z) : 0), wet,
        shore: p => { for (let r = 1.5; r <= 7; r += 1.5) for (let a = 0; a < 6.28; a += 0.5) if (wet(p.x + Math.cos(a) * r, p.z + Math.sin(a) * r)) return true; return false; },
        farText: "Go down to the water's edge — a lake, or the shore — and face the water to cast.",
        odds: () => 0.5,
        ripple: (x, z, size = 1) => {
          const m = rings.find(q => q.k >= 1) || (rings.length < 10 ? (() => { const q = { mesh: new THREE.Mesh(new THREE.RingGeometry(0.85, 1, 20).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xc8d0d8, transparent: true, opacity: 0, depthWrite: false })), k: 1 }; fg.add(q.mesh); rings.push(q); return q; })() : rings[0]);
          m.k = 0; m.s = size; m.mesh.position.set(x, WATER - 0.03, z);
        },
        onCatch: () => {
          if (this.packHas && (this.pack.stone + this.pack.food) >= (this.packMax || 40)) { UI.hint("A fish — but your pack's full, so back it goes. Empty it at the hearth.", 3); return; }
          this.net.send({ t: "fish" });
          UI.hint(["A fish, fighting all the way in. Into your pack: food for the store.", "A good one, as long as your hand. Into your pack.", "A little one — it'll still feed someone."][Math.floor(Math.random() * 3)], 3);
        } });
      this.fishRings = rings;
    }
    // the wild beasts: kept by the server, the same for everyone; shown here, and hunted
    this.hunt = new Hunt(w, { x: 0, z: 0, r: 1 }, {});
    G.onFrame.push(dt => this.tick(dt));
    G.achEvent && (G.achEvent("mp-join"), r.persistent && G.achEvent("mp-world"), target && target.host && G.achEvent("mp-host"));
    this.listen();
    this.pack = { stone: 0, food: 0 }; if (inMsg.you.pack && this.net.on.pack) this.net.on.pack(inMsg.you.pack);
    // on the Earth, with no homestead yet: where in the world will you begin?
    if (w.land.kind === "earth" && !inMsg.you.home) setTimeout(() => this.chooseStart(), 600);
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
  // (a co-op settlement is the host's to run: what's built, who works where; the others help)
  manages() { return this.mode !== "coop" || !this.room.hostPid || this.room.hostPid === this.pid; }
  hostName() { return this.room.host || "the host"; }
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
    // (looking at a building offers only what can be done there: climb the tower, trade at the market, set people to
    //  work a field, open a cabin's door — nothing that's only a description)
    const act = b.type === "tower" || b.type === "market" || b.type === "field";
    if (act) e.it = this.w.addInteract({ x: b.x, y: this.w.heightAt(b.x, b.z) + 1.2, z: b.z, reach: (d.wall ? d.len / 2 : d.r) + 2.2,
      can: () => b.type === "tower" || (e.friendly && (b.type === "market" || this.manages())),
      label: () => {
        if (b.type === "tower") return "Climb the watchtower";
        if (b.type === "market") return "Trade: 4 logs for a stone · hold F: a stone for 3 logs";
        const on = [...this.settlers.values()].filter(v => v.pin === b.id).map(v => v.name);
        return `Put someone to work this field${on.length ? ` (${on.join(", ")} ${on.length > 1 ? "work" : "works"} it)` : ""}`;
      },
      use: () => {
        if (b.type === "tower") { const t = (this.w.towers || []).find(q => q.id === b.id); if (!t) return; const pl = G.player; if (pl.pos.y > t.top - 1) { pl.place(b.x + Math.sin(b.ry || 0) * 2.2, b.z + Math.cos(b.ry || 0) * 2.2, pl.yaw); } else { pl.pos.set(b.x, t.top, b.z); pl.vy = 0; } sfx("build"); }
        else if (b.type === "market") this.net.send({ t: "trade", want: "stone" });
        else this.workField(b);
      } });
    // the store, at the hearth and at a woodshed: the logs you carry stacked, or taken out to carry to a site
    if ((b.type === "hearth" || b.type === "shed") && fr) e.it4 = this.w.addInteract({ x: b.x, y: this.w.heightAt(b.x, b.z) + 0.8, z: b.z, reach: d.r + 2.4,
      can: () => !this.dead && (this.carry > 0 || this.packHas() || (this.stock.wood > 0 && this.carry < 6)),
      label: () => this.carry > 0 || this.packHas() ? `Put in the store: ${[this.carry && `${this.carry} log${this.carry > 1 ? "s" : ""}`, this.pack.stone && `${this.pack.stone} stone`, this.pack.food && `${this.pack.food} food`].filter(Boolean).join(", ")}` : `Take logs from the store (${this.stock.wood})`,
      use: () => this.net.send({ t: this.carry > 0 || this.packHas() ? "stack" : "unstack", id: b.id }) });
    // a cabin's door: F to open it and go in, F to shut it
    if (e.setDoor) {
      const c = Math.cos(b.ry || 0), sn = Math.sin(b.ry || 0), dx = b.x + 3.05 * sn, dz = b.z + 3.05 * c;
      e.it3 = this.w.addInteract({ x: dx, y: this.w.heightAt(dx, dz) + 1.2, z: dz, reach: 2.1, label: () => e.doorOpen ? "Close the door" : "Open the door",
        use: () => { e.setDoor(!e.doorOpen); AUDIO.door && AUDIO.door(e.doorOpen, 0.3); } });
    }
    // a shipyard of your own: a ship built there, off the slipway into the water
    if (b.type === "shipyard" && fr) e.it2 = this.w.addInteract({ x: b.x, y: this.w.heightAt(b.x, b.z) + 1.4, z: b.z, reach: d.r + 4, hold: 3,
      can: () => !this.dead,
      label: () => this.stock.wood >= SHIP.wood && this.stock.stone >= SHIP.stone ? `Build a ship (${SHIP.wood} logs and ${SHIP.stone} stone from the store)` : `A ship takes ${SHIP.wood} logs and ${SHIP.stone} stone from the store — ${[this.stock.wood < SHIP.wood && `${SHIP.wood - this.stock.wood} logs`, this.stock.stone < SHIP.stone && `${SHIP.stone - this.stock.stone} stone`].filter(Boolean).join(" and ")} short`,
      onHoldTick: (dt, t) => { if (Math.floor(t * 2.6) !== Math.floor((t - dt) * 2.6)) sfx("hammer"); },
      use: () => { if (this.stock.wood >= SHIP.wood && this.stock.stone >= SHIP.stone) this.net.send({ t: "ship", id: b.id }); else sfx("deny"); } });
    if (b.type === "market") e.it2 = this.w.addInteract({ x: b.x, y: this.w.heightAt(b.x, b.z) + 1.2, z: b.z, reach: d.r + 2.2, hold: 1.2, can: () => e.friendly && this.stock.stone > 0 && input.down("ShiftLeft"), label: "Hold F: a stone for 3 logs", use: () => this.net.send({ t: "trade", want: "wood" }) });
  }
  removeBNow(id) { const e = this.w.blds.get(id); if (!e) return; if (e.it) this.w.removeInteract(e.it); if (e.it2) this.w.removeInteract(e.it2); if (e.it3) this.w.removeInteract(e.it3); if (e.it4) this.w.removeInteract(e.it4); this.w.blds.delete(id); for (const c of e.cols) this.w.col.remove(c); if (this.w.towers) this.w.towers = this.w.towers.filter(t => t.id !== id); if (e.g.userData.flame) { const i = this.w.flames.indexOf(e.g.userData.flame); if (i >= 0) this.w.flames.splice(i, 1); } this.w.root.remove(e.g); }
  removeB(id) { const e = this.w.blds.get(id); if (!e) return; if (e.it) this.w.removeInteract(e.it); if (e.it2) this.w.removeInteract(e.it2); if (e.it3) this.w.removeInteract(e.it3); if (e.it4) this.w.removeInteract(e.it4); this.w.removeBuilding(id); }
  // ---- what the server says ----
  listen() {
    const n = this.net.on, w = this.w;
    n.ps = m => { for (const l of m.l) { const r = this.remotes.get(l[0]); if (r) r.set(l); } };
    n.pj = m => { this.online.add(m.p.pid); this.addRemote(m.p); this.refreshFriends(); };
    n.pl = m => { this.online.delete(m.pid); const r = this.remotes.get(m.pid); if (r) { r.remove(); this.remotes.delete(m.pid); } this.hudCount(); this.refreshFriends(); };
    n.stock = m => { const fed = (m.food | 0) > (this.stock.food | 0) + 4; this.stock = { wood: m.wood, stone: m.stone, food: m.food | 0 }; this.hudStock(true); if (fed && this.settlers.size) this.toast(`Harvest in: ${m.food} food in the store`); };
    n.bg = m => { const e = this.w.blds.get(m.id); if (e) { e.b.growth = m.growth; this.w.setGrowth(e.b, e.g, m.growth); } };
    n.chip = m => { const t = w.thing(m.id); if (!t) return; const r = this.remotes.get(m.by); if (t.id[0] === "r" || t.id[0] === "s") { AUDIO.clang && AUDIO.clang(0.25, { x: t.x, y: t.y + 0.5, z: t.z }); } else if (r && Math.hypot(t.x - G.player.pos.x, t.z - G.player.pos.z) < 30) G.woodChips && G.woodChips(t, 0.6); };
    n.fell = m => {
      const t = w.fell(m.id, m.dx, m.dz); if (!t) return;
      FOLEY.fellStart({ x: t.x, z: t.z });
      G.startleBirds && G.startleBirds(t.x, t.z);
      const f = w.falling[w.falling.length - 1];
      if (f) f.onDown = () => { const r = (t.h || 9) * 0.5; FOLEY.crash(1, { x: t.x + f.dir.x * r, z: t.z + f.dir.z * r }); };
      if (m.by === this.pid) G.woodChips && G.woodChips(t, 2.2);
      else if (Math.hypot(t.x - G.player.pos.x, t.z - G.player.pos.z) < 30) G.woodChips && G.woodChips(t, 1.4);
    };
    n.rock = m => { const k = w.thing(m.id); if (k) { w.broken.add(m.id); w.hideRock(k); if (Math.hypot(k.x - G.player.pos.x, k.z - G.player.pos.z) < 40) { G.rockChips && G.rockChips(k, 2); FOLEY.crash(0.35, { x: k.x, z: k.z }); } } else w.broken.add(m.id); if (m.by === this.pid) this.toast("Stone into your pack — put it in the store at the hearth"); };
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
    n.pile = m => this.setPile(m.p);
    n.pilex = m => this.dropPile(m.id);
    n.site = m => this.setSite(m.s);
    n.sitex = m => this.dropSite(m.id);
    n.ax = m => { if (this.hunt) this.hunt.puppets(m.l || []); };
    n.boat = m => this.setBoat(m.o);
    n.bm = m => { for (const [id, x, z, yaw] of m.l || []) { const e = this.boats.get(id); if (!e || (this.aboard && this.aboard.e === e && this.aboard.helm)) continue; e.o.x = x; e.o.z = z; e.o.yaw = yaw; } };
    n.carry = m => { const was = this.carry; this.setCarry(m.n); if (m.n !== was) sfx("pickup"); };
    // what's in your pack: the stone you've broken and the food you've picked up, yours till you put it in the store
    n.pack = m => {
      const was = this.pack || { stone: 0, food: 0 };
      this.pack = { stone: m.stone | 0, food: m.food | 0 }; if (m.max) this.packMax = m.max;
      const keep = (icon, name, note, k) => { let it = G.pack.find(i => i.icon === icon); if (k > 0) { if (!it) G.pack.push(it = { icon, name, note, n: k }); else it.n = k; } else if (it) G.pack.splice(G.pack.indexOf(it), 1); };
      keep("stone", "Stone", "Broken from the grey rocks. Put it in the store at the hearth or a woodshed (F), or use it straight from your pack at a site.", this.pack.stone);
      keep("fish", "Fish", "Caught at the water. Put it in the store at the hearth (F), where the settlers eat from — each feeds two.", this.pack.food);
      if (this.pack.stone > was.stone || this.pack.food > was.food) window.__foley && window.__foley.packIn(0.32);
    };
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
    n.spin = m => { const v = this.settlers.get(m.id); if (v) v.pin = m.field || null; };
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
    n.kicked = m => { if (G.mp !== this) return; this.kicked = true; this.leave(true); this.hooks.lost && this.hooks.lost(m.text || "The host has sent you away."); };
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
    for (const r of this.remotes.values()) { if (r.dead || Math.abs((r.ty ?? p.y) - p.y) > 6) continue; const d = ahead(r.x, r.z, 2.8); if (d < bd) { bd = d; best = r; } }
    if (best) {
      if (this.mode === "coop") { UI.hint("Not in a game among friends.", 2); return; }
      if (this.friendly(best.pid)) { UI.hint(`${best.name} is your ally.`, 2); return; }
      this.net.send({ t: "hit", pid: best.pid }); G.impact && G.impact();
      return;
    }
    // down a cave: nothing up top in reach — only the seams of stone in its walls
    const cave = this.w.cave;
    if (cave && cave.inside) {
      let rk = null; bd = Infinity;
      for (const k of cave.rocks) { if (k.gone) continue; const d = ahead(k.x, k.z, k.s + 2.2) - k.s; if (d < bd) { bd = d; rk = k; } }
      if (!rk) return;
      if (G.player.blade !== "pick") { UI.hint("Stone wants the pickaxe — take it out (2) and swing at the seam.", 3); return; }
      AUDIO.clang && AUDIO.clang(0.35, { x: rk.x, y: rk.y + 0.5, z: rk.z }); G.rockChips && G.rockChips(rk, 1); G.impact && G.impact();
      this.net.send({ t: "mine", id: rk.id });
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
    // a site laid out: taken down by whoever laid it out (or the host) — two blows, so it isn't done by mistake; its logs are
    // left on the ground
    let sq = null; bd = Infinity;
    for (const e of this.sites.values()) { const d = BUILD[e.q.type], dist = ahead(e.q.x, e.q.z, (d.wall ? d.len / 2 : d.r) + 2.2) - (d.wall ? 0 : d.r); if (dist < bd) { bd = dist; sq = e; } }
    if (sq && (sq.q.owner === this.pid || (this.mode === "coop" && this.room.hostPid === this.pid))) {
      if (this.unsiteAsk && this.unsiteAsk.id === sq.q.id && performance.now() - this.unsiteAsk.at < 3000) { this.unsiteAsk = null; this.net.send({ t: "unsite", id: sq.q.id }); G.impact && G.impact(); return; }
      this.unsiteAsk = { id: sq.q.id, at: performance.now() };
      UI.hint(`Swing again to take down the ${BUILD[sq.q.type].name.toLowerCase()}'s site — its logs are left on the ground.`, 3);
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
    if (tr && G.player.blade !== "pick") {
      sfx("chop"); G.impact && G.impact(); G.woodChips && G.woodChips(tr, 1);
      this.net.send({ t: "chop", id: tr.id });
      return;
    }
    // a rock: with the pickaxe (as in the settlement — the axe only blunts on it)
    if (G.player.blade !== "pick") { if (this.rockAhead(p, f)) UI.hint("Stone wants the pickaxe — take it out (2) and swing at the rock.", 3); return; }
    if (!this.rockAhead(p, f)) { if (tr) UI.hint("That's the pickaxe — take out the axe (1) for trees.", 2.5); return; }
    let rk = null; bd = Infinity;
    const ch = this.w.chunkAt(p.x, p.z);
    for (const c of [ch, this.w.chunkAt(p.x + 4, p.z), this.w.chunkAt(p.x - 4, p.z), this.w.chunkAt(p.x, p.z + 4), this.w.chunkAt(p.x, p.z - 4)]) if (c) for (const k of c.rocks) { if (k.gone) continue; const d = ahead(k.x, k.z, k.s + 2.2) - k.s; if (d < bd) { bd = d; rk = k; } }
    if (rk) {
      AUDIO.clang && AUDIO.clang(0.35, { x: rk.x, y: rk.y + 0.5, z: rk.z }); G.rockChips && G.rockChips(rk, 1); G.impact && G.impact();
      this.net.send({ t: "mine", id: rk.id });
    }
  }
  // ---- building ----
  // who works this field: your people, each to be set to it (or let go from it)
  workField(b) {
    if (!this.manages()) { UI.hint(`It's ${this.hostName()}'s settlement: they say who works where.`, 3.5); return; }
    const mine = [...this.settlers.values()].filter(v => v.owned() && !v.dying);
    if (!mine.length) { UI.hint("Nobody lives here yet. Raise a cabin, and settlers will come through the woods.", 4); return; }
    G.openTrade && G.openTrade("Who works this field", "Set someone to farm it: they sow, tend and reap it, and the harvest feeds everyone.", mine.map(v => ({
      icon: "seeds", label: v.name, note: v.pin === b.id ? "Works this field — click to let them go back to whatever's wanted" : v.pin ? "Works another field" : `Now a ${JOB_NAME[v.job] || v.job}`,
      get: v.pin === b.id ? "here" : "", can: () => true,
      do: () => { this.net.send({ t: "assign", sid: v.id, field: v.pin === b.id ? null : b.id }); v.pin = v.pin === b.id ? null : b.id; },
    })), null);
  }
  // the plans: the same window, the same rows and pictures as the plans in the settlement (B) — only Frontier's own buildings
  openBuild(on) {
    this.menuOpen = on;
    $("buildmenu").classList.toggle("hidden", !on);
    $("mpBuild").classList.add("hidden");
    if (!on) return;
    const IC = G.icons || {}, PIC = { hearth: "logs", cabin: "cabin", shed: "logs", house: "cabin", field: "seeds", well: "well", wall: "logs", gate: "logs", tower: "weapon", forge: "tools", market: "coin", rowboat: "logs", shipyard: "planks" };
    $("buildTitle").textContent = "Plans";
    $("buildList").innerHTML = BUILD_ORDER.map((k, i) => {
      // (the hearth is lit from the store; anything else is laid out as a site, and its logs brought to it)
      const fromStore = k === "hearth" || k === "rowboat";
      const d = BUILD[k], ok = !fromStore || this.stock.wood >= d.wood, has = k === "hearth" && this.myHearth();
      const cost = fromStore ? `${d.wood} logs from the store` : [`${d.wood} logs to bring`, d.stone ? `${d.stone} stone` : ""].filter(Boolean).join(", ");
      const short = !ok ? ` — ${d.wood - this.stock.wood} logs short` : "";
      return `<button class="plan${ok && !has ? "" : " short"}" data-k="${k}" data-i="${i}"><img src="${IC[PIC[k]] || IC.logs || ""}" alt=""><span><span class="pn">${esc(d.name)}</span><span class="pd">${esc(d.note)}${has ? (this.mode === "coop" ? " (The colony has one.)" : " (You have one.)") : esc(short)}</span></span><span class="pc">${cost}</span></button>`;
    }).join("");
    for (const b of $("buildList").querySelectorAll("[data-k]")) b.onclick = () => { if (b.classList.contains("short")) { sfx("deny"); return; } this.startBuild(b.dataset.k); };
  }
  startBuild(type) {
    this.openBuild(false);
    G.lockMouse && G.lockMouse();
    const d = BUILD[type]; if (!d) return;
    if (this.build) this.endBuild();
    // what it will look like, as the settlement's plans show it: the building itself, pale green, its ground outlined
    const tint = new THREE.MeshStandardMaterial({ color: 0x7fe07a, transparent: true, opacity: 0.42, depthWrite: false, roughness: 0.8, emissive: 0x2a5a26, emissiveIntensity: 0.5 });
    const dress = o => { o.traverse(m => { if (m.isMesh || m.isInstancedMesh) { m.material = tint; m.castShadow = false; m.receiveShadow = false; } }); return o; };
    const ghost = new THREE.Group(), body = new THREE.Group(); ghost.add(body);
    let geo;
    if (d.wall) geo = new THREE.BoxGeometry(d.len, 2.6, 0.4).translate(0, 1.3, 0);
    else if (type === "hearth") geo = new THREE.CylinderGeometry(0.85, 0.85, 0.5, 16).translate(0, 0.25, 0);
    else if (type === "tower") geo = new THREE.BoxGeometry(2.6, 6.4, 2.6).translate(0, 3.2, 0);
    else if (type === "well") geo = new THREE.CylinderGeometry(1.2, 1.2, 1.4, 14).translate(0, 0.7, 0);
    else if (d.field) geo = new THREE.BoxGeometry(d.w || 6, 0.08, d.d || 7).translate(0, 0.04, 0);
    else geo = new THREE.BoxGeometry((d.w || 4) * 0.9, 3.2, (d.d || 4) * 0.9).translate(0, 1.6, 0);
    body.add(new THREE.Mesh(geo, tint));
    if (type === "rowboat") { body.clear(); body.add(dress(makeRowboat())); }
    if (type === "shipyard") { body.clear(); body.add(dress(makeShipyard(d.w, d.d))); }
    if (d.model) { const put = () => { const m = modelCopy(d.model); if (!m) return false; body.clear(); body.add(dress(m.scene)); return true; }; if (!put()) ensureModel(d.model).then(ok => { if (ok && this.build && this.build.ghost === ghost) put(); }); }
    const fw = d.wall ? d.len : d.w || d.r * 2, fd = d.wall ? 0.5 : d.d || d.r * 2;
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(fw, 0.05, fd)), new THREE.LineBasicMaterial({ color: 0x7fe07a })); edges.position.y = 0.05; ghost.add(edges); ghost.userData.edges = edges; ghost.userData.tint = tint;
    // the ground it will claim, for a hearth
    if (d.claim) { const ring = new THREE.Mesh(new THREE.RingGeometry(d.claim - 0.25, d.claim, 64).rotateX(-Math.PI / 2), tint); ring.position.y = 0.3; ghost.add(ring); }
    UI.keys(d.wall ? [["Click", "lay a length"], ["Hold R / Y", "turn it"], ["B", "done"]] : [["Click", "set it here"], ["Hold R / Y", "turn it"], ["B", "put the plan away"]]);
    G.scene.add(ghost);
    this.build = { type, d, ghost, rot: this.wallRy ?? G.player.yaw, ok: false };
    G.onSwing = null;
    $("mpBuildBar").classList.remove("hidden");
  }
  endBuild() {
    if (!this.build) return;
    G.scene.remove(this.build.ghost);
    this.build = null; $("keys").classList.add("hidden"); G.onSwing = () => this.swing();
    $("mpBuildBar").classList.add("hidden");
  }
  tickBuild() {
    const B = this.build, pl = G.player, d = B.d, f = pl.forward();
    const dist = d.wall ? 3.2 : d.boat ? 4.5 : (d.r || 1.5) + 3.6;
    const x = pl.pos.x + f.x * dist, z = pl.pos.z + f.z * dist;
    // (turned smoothly while R is held, Y the other way — nothing snaps, as in the settlement)
    const dt = 1 / 60;
    if (input.down("KeyR")) B.rot += dt * 1.7 * (input.down("ShiftLeft") || input.down("ShiftRight") ? -1 : 1);
    if (input.down("KeyY")) B.rot -= dt * 1.7;
    const ry = B.rot;
    const y = this.w.heightAt(x, z);
    B.ghost.position.set(x, d.boat ? WATER - 0.05 : y, z); B.ghost.rotation.y = ry;
    // will it do?
    let why = "";
    if (d.boat) {
      // (a boat: on the water, a little way out from the shore)
      if (this.stock.wood < d.wood) why = `A rowboat takes ${d.wood} logs from the store`;
      else if (y > -0.4) why = "A boat goes on the water — face the water, by the shore";
      B.ok = !why; B.x = x; B.z = z; B.ry = ry;
      const col = B.ok ? 0x7fe07a : 0xe0503a; B.ghost.userData.tint.color.setHex(col); B.ghost.userData.edges.material.color.setHex(col);
      $("mpBuildBar").classList.toggle("hidden", B.ok); if (!B.ok) $("mpBuildBar").innerHTML = `<b>${d.name}</b> — ${esc(why)}`;
      if (input.rclick) { this.endBuild(); return; }
      if ((input.click || input.hit("KeyF")) && !UI.dialogOpen) { input.click = false; if (!B.ok) { sfx("deny"); return; } this.net.send({ t: "build", type: B.type, x: +x.toFixed(2), z: +z.toFixed(2), ry: +ry.toFixed(3) }); G.working = { kind: "hammer", until: G.time + 0.6 }; this.endBuild(); }
      return;
    }
    if (B.type === "hearth" && this.stock.wood < d.wood) why = `A hearth takes ${d.wood} logs from the store`;
    else if (y < 0.6) why = "Not in the water";
    else if (d.shore && this.w.land.heightAt(x + Math.sin(ry) * (d.d / 2 + 6), z + Math.cos(ry) * (d.d / 2 + 6)) > -1.2) why = "Its front, the slipway, must run out over deep water — turn it (R) to face the water";
    else if (Math.abs(x) > this.room.half - 10 || Math.abs(z) > this.room.half - 10) why = "The edge of the map";
    else {
      const r = d.wall ? d.len / 2 : d.r || 1.5;
      let lo = Infinity, hi = -Infinity; for (const [a, b] of [[r, 0], [-r, 0], [0, r], [0, -r], [0, 0]]) { const h = this.w.heightAt(x + a, z + b); lo = Math.min(lo, h); hi = Math.max(hi, h); }
      if (hi - lo > (d.wall ? 1.6 : d.shore ? 6 : 1.2)) why = "Too steep";
    }
    if (!why) for (const e of this.w.blds.values()) {
      const c = BUILD[e.b.type];
      if (c.claim && !e.friendly && Math.hypot(e.b.x - x, e.b.z - z) < c.claim) { why = `${e.ownerName}'s ground`; break; }
      if (B.type === "hearth" && c.claim && !e.friendly && Math.hypot(e.b.x - x, e.b.z - z) < c.claim + d.claim) { why = "Too near someone's homestead"; break; }
      const gap = (d.wall && c.wall) ? 1.2 : (d.wall ? 0.3 : d.r) + (c.wall ? 0.3 : c.r) - 0.2;
      if (Math.hypot(e.b.x - x, e.b.z - z) < gap) { why = "Something's in the way"; break; }
    }
    if (!why) for (const e of this.sites.values()) { const c = BUILD[e.q.type]; if (Math.hypot(e.q.x - x, e.q.z - z) < (d.wall ? 0.3 : d.r) + (c.wall ? 0.3 : c.r) - 0.2) { why = "There's a site laid out there already"; break; } }
    if (!why && B.type === "hearth" && this.myHearth()) why = this.mode === "coop" ? "The colony has its hearth" : "You have a hearth already";
    if (!why && !d.wall) for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) { const ch = this.w.chunkAt(x + i * 8, z + j * 8); if (ch) for (const t of ch.trees) if (!t.gone && Math.hypot(t.x - x, t.z - z) < (d.r || 1.5) * 0.8) why = "Fell the trees here first"; }
    B.ok = !why; B.x = x; B.z = z; B.ry = ry;
    const col = B.ok ? 0x7fe07a : 0xe0503a; B.ghost.userData.tint.color.setHex(col); B.ghost.userData.edges.material.color.setHex(col);
    // (why not, when it won't do — said under it)
    $("mpBuildBar").classList.toggle("hidden", B.ok); if (!B.ok) $("mpBuildBar").innerHTML = `<b>${d.name}</b> — ${esc(why)}`;
    if (input.rclick) { this.endBuild(); return; }
    if ((input.click || input.hit("KeyF")) && !UI.dialogOpen) {
      input.click = false;
      if (!B.ok) { sfx("deny"); return; }
      this.net.send({ t: "build", type: B.type, x: +x.toFixed(2), z: +z.toFixed(2), ry: +ry.toFixed(3) });
      G.working = { kind: "hammer", until: G.time + 0.6 };
      // (walls go up one after another; anything else, once)
      if (!d.wall) this.endBuild(); else this.wallRy = ry;
    }
  }
  // ---- every frame ----
  tick(dt) {
    if (this.boats) this.tickBoats(dt);
    if (this.fish) {
      this.fish.t += dt; this.fish.fishTick(dt); this.fish.ringTick(dt);
      for (const q of this.fishRings || []) { if (q.k >= 1) { q.mesh.material.opacity = 0; continue; } q.k = Math.min(1, q.k + dt / 1.8); q.mesh.scale.setScalar((0.1 + q.k * 0.9) * q.s); q.mesh.material.opacity = 0.3 * (1 - q.k); }
    }
    const pl = G.player, now = performance.now();
    if ((this.goalT = (this.goalT || 0) - dt) <= 0) { this.goalT = 1; try { this.goals(); } catch (e) {} }
    // your health is the server's: no mending here but what it says, no hunger in these woods
    G.health = this.hp / MAX_HP; if (G.body) G.body.hunger = 1;
    if (this.build) this.tickBuild();
    // where you are, ten times a second
    if ((this.sendT -= dt) <= 0) {
      this.sendT = 0.1;
      const guard = !!(input.rdown && pl.axe && !this.build);
      this.net.send({ t: "st", c: pl.crouched ? 1 : 0, x: +pl.pos.x.toFixed(2), y: +pl.pos.y.toFixed(2), z: +pl.pos.z.toFixed(2), yaw: +pl.yaw.toFixed(3), a: pl.swingT >= 0 ? "chop" : G.working && G.working.until > G.time && G.working.kind === "hammer" ? "hammer" : "idle", h: "axe", s: +(pl.speed || 0).toFixed(2), g: guard });
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
    clearInterval(this._stockPos); if (on) this._stockPos = setInterval(() => this.placeStock(), 300);
    document.body.classList.toggle("mp", on);
    if (!on) return;
    $("mpRoom").textContent = this.room.persistent ? "The Wide World" : this.room.name;
    $("mpMode").textContent = `${MODES[this.mode]} · ${TERRAINS[this.room.kind] ? TERRAINS[this.room.kind].name : ""}`;
    this.hudStock(); this.hudCount(); this.drawChat();
  }
  hudStock(flash) {
    // (as the settlement's own bar: its pictures, under the objective)
    const IC = G.icons || {}, el = $("mpStock");
    el.innerHTML = `<span class="tb" title="logs"><img src="${IC.logs || ""}" alt=""><b id="mpLogs">${this.stock.wood}</b></span><span class="tb" title="stone"><img src="${IC.stone || ""}" alt=""><b id="mpStone">${this.stock.stone}</b></span><span class="tb" title="food"><img src="${IC.bread || IC.rye || ""}" alt=""><b id="mpFood">${this.stock.food | 0}</b></span>`;
    el.classList.toggle("hungry", (this.stock.food | 0) <= 0 && this.settlers.size > 0);
    if (flash) { el.classList.remove("flash"); void el.offsetWidth; el.classList.add("flash"); }
    if (this.menuOpen) this.openBuild(true);
  }
  placeStock() { const ob = $("objective"), on = ob && !ob.classList.contains("hidden"); $("mpStock").style.top = (on ? ob.offsetTop + ob.offsetHeight + 8 : 24) + "px"; }
  hudCount() { const n = this.remotes.size + 1; $("mpCount").textContent = `${n} ${n === 1 ? "person" : "people"} here`; }
  toast(text) { const e = $("mpToast"); e.textContent = text; e.classList.remove("hidden", "bad"); this.toastT = 2.6; }
  warn(text) { const e = $("mpToast"); e.textContent = text; e.classList.remove("hidden"); e.classList.add("bad"); this.toastT = 4; sfx("deny"); }
  banner(title, sub) { const e = $("mpDead"); if (!title) { e.classList.add("hidden"); return; } e.innerHTML = `<div class="t">${title}</div><div class="s">${sub || ""}</div>`; e.classList.remove("hidden"); }
  chatLine(c, old) {
    this.chatLines.push({ who: c.name, text: c.text, at: old ? 0 : performance.now(), to: c.to, mine: c.pid === this.pid });
    if (this.chatLines.length > 40) this.chatLines.shift();
    // (heard as it goes up: a person's words a little louder than the game's own notices)
    if (!old) window.__uisfx && window.__uisfx.chat(!c.name);
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
      if (e.key === "Enter") { const t = i.value.trim(); if (t && !hostCommand(this.net, t)) this.net.send({ t: "chat", text: t, allies: !!this.alliesOnly }); this.closeChat(); }
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
        const hostActs = p.pid !== this.pid && this.room.hostPid === this.pid ? `<button data-a="kick" data-p="${p.pid}">Send away</button><button data-a="ban" data-p="${p.pid}">Ban</button>` : "";
        return `<div class="mp-pl${ally ? " ally" : ""}"><span class="n">${esc(p.name)}${p.pid === this.room.hostPid ? " <i>(host)</i>" : ""}</span><span class="g">${grp && this.groups[grp] ? esc(this.groups[grp].name) : ""}</span><span class="a">${acts}${hostActs}</span></div>`;
      }).join("") + `<p class="mc-hint">${this.mode === "pvp" ? "Allies can't hurt each other, share their gates, and can build on each other's ground. Up to eight to an alliance." : "In co-op no one can be hurt, and you can all build anywhere."}${this.room.persistent ? " In the wide world, a homestead can't be broken while its owner is away." : " Nothing of yours can be broken while you're away from the game."}</p>`;
    for (const b of $("mpPlayersBody").querySelectorAll("button[data-a]")) b.onclick = () => {
      const a = b.dataset.a, pid = b.dataset.p;
      if (a === "ally") this.net.send({ t: "ally", pid });
      else if (a === "unally") this.net.send({ t: "unally" });
      else if (a === "give") this.net.send({ t: "give", pid, wood: 10 });
      else if (a === "kick" || a === "ban") { if (a === "ban" && !confirm(`Ban ${this.nameOf(pid)}? They won't be able to come back into this game.`)) return; this.net.send({ t: a, pid }); setTimeout(() => this.listOpen && this.drawList(), 600); }
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
    // (Enter to talk — T is the inventory, as everywhere else)
    if (e.code === "Enter") { e.preventDefault(); this.openChat(); return true; }
    if (e.code === "Tab") { e.preventDefault(); this.toggleList(); return true; }
    if (e.code === "KeyN" && !this.invite) { this.toggleNews(); return true; }
    if (e.code === "KeyB") { if (this.build) this.endBuild(); else { const on = !this.menuOpen; this.openBuild(on); if (on) G.releaseMouse && G.releaseMouse(); else G.lockMouse && G.lockMouse(); } return true; }
    if (this.menuOpen && /^Digit\d$/.test(e.code)) { const i = (+e.code.slice(5) + 9) % 10, k = BUILD_ORDER[i]; const d = BUILD[k]; if (k && (k !== "hearth" || this.stock.wood >= d.wood)) this.startBuild(k); return true; }
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
  // a grey rock ahead, close enough to strike
  rockAhead(p, f) {
    for (const c of [this.w.chunkAt(p.x, p.z), this.w.chunkAt(p.x + 4, p.z), this.w.chunkAt(p.x - 4, p.z), this.w.chunkAt(p.x, p.z + 4), this.w.chunkAt(p.x, p.z - 4)]) if (c) for (const k of c.rocks) {
      if (k.gone) continue; const dx = k.x - p.x, dz = k.z - p.z, d = Math.hypot(dx, dz);
      if (d < k.s + 2.4 && (d < 0.7 || (dx * f.x + dz * f.z) / d > 0.45)) return k;
    }
    return null;
  }
  // ---- logs and sites, as in the settlement ----
  setCarry(n) { this.carry = n; if (G.player) G.player.carryN = n; UI.carry(n ? `Carrying ${n} log${n > 1 ? "s" : ""}` : null); }
  // a tree's logs, lying where it fell: F to take them up (six in your arms at most)
  setPile(q) {
    let e = this.piles.get(q.id);
    if (!e) {
      const g = new THREE.Group(), y = this.w.heightAt(q.x, q.z);
      g.add(makeLogs([0, 1, 2].map(i => ({ x: (i - 1) * 0.3, y: 0.15 + (i === 1 ? 0.24 : 0), z: 0, len: 1.8, r: 0.15, dir: "z" })), Math.floor(q.x * 13 + q.z), q.k));
      g.position.set(q.x, y, q.z); g.rotation.y = q.a || 0; this.w.root.add(g);
      e = { q, g };
      e.it = this.w.addInteract({ x: q.x, y: y + 0.4, z: q.z, reach: 2.4, can: () => !this.dead && this.carry < 6, label: () => `Take the logs (${e.q.n})`, use: () => this.net.send({ t: "take", id: q.id }) });
      this.piles.set(q.id, e);
    }
    e.q = q;
  }
  dropPile(id) { const e = this.piles.get(id); if (!e) return; this.w.root.remove(e.g); this.w.removeInteract(e.it); this.piles.delete(id); }
  // a building laid out: its outline and frame, pale, the logs brought heaped by it; F to add yours, and when there are
  // enough, hold F to raise it (with the stone from the store)
  // a building site, as the settlement draws one: stakes at its corners and a cord between them, a sign of what it
  // still wants, and the logs brought heaped beside it — not the building itself, till it's raised
  setSite(q) {
    const d = BUILD[q.type]; if (!d) return;
    let e = this.sites.get(q.id);
    const fw = d.wall ? d.len : d.w || d.r * 2, fd = d.wall ? 0.5 : d.d || d.r * 2;
    if (!e) {
      const g = new THREE.Group(), y = this.w.heightAt(q.x, q.z);
      g.position.set(q.x, y, q.z); g.rotation.y = q.ry || 0;
      const stake = new THREE.MeshStandardMaterial({ color: 0x8a6a45, roughness: 0.9 }), cord = new THREE.MeshStandardMaterial({ color: 0xd8ceb4, roughness: 1 });
      const corners = d.wall ? [[-1, 0], [1, 0]] : [[-1, -1], [1, -1], [1, 1], [-1, 1]];
      for (const [sx, sz] of corners) { const m = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.1, 0.1), stake); m.position.set(sx * fw / 2, 0.55, sz * fd / 2); m.castShadow = true; g.add(m); }
      if (d.wall) { const c = new THREE.Mesh(new THREE.BoxGeometry(fw, 0.02, 0.02), cord); c.position.y = 0.9; g.add(c); }
      else for (const [x0, z0, x1, z1] of [[-1, -1, 1, -1], [1, -1, 1, 1], [1, 1, -1, 1], [-1, 1, -1, -1]]) {
        const ax = x0 * fw / 2, az = z0 * fd / 2, bx = x1 * fw / 2, bz = z1 * fd / 2;
        const c = new THREE.Mesh(new THREE.BoxGeometry(Math.max(0.02, Math.abs(bx - ax)), 0.02, Math.max(0.02, Math.abs(bz - az))), cord); c.position.set((ax + bx) / 2, 0.9, (az + bz) / 2); g.add(c);
      }
      const heap = new THREE.Group(); heap.position.set(fw / 2 + 0.9, 0, 0); g.add(heap);
      this.w.root.add(g);
      e = { q, g, heap, n: -1, sig: "" };
      const M = this;
      e.it = this.w.addInteract({ x: q.x, y: y + 0.9, z: q.z, reach: (d.wall ? d.len / 2 : Math.max(fw, fd) / 2) + 1.6,
        // (a quick F to put the logs in; held, once it has them all, to raise it)
        get hold() { return e.q.logs >= d.wood ? 3 : 0; },
        // (only when there's something to do here: logs to add, or it's ready to raise — the heap shows how far it's come)
        can: () => !M.dead && ((M.carry > 0 && e.q.logs < d.wood) || e.q.logs >= d.wood),
        label: () => {
          const Q = e.q, need = d.wood;
          if (Q.logs < need) return `Add ${Math.min(M.carry, need - Q.logs)} log${Math.min(M.carry, need - Q.logs) > 1 ? "s" : ""} (${Q.logs} of ${need})`;
          const st = M.stock.stone + ((M.pack && M.pack.stone) | 0);
          if (d.stone && st < d.stone) return `Needs ${d.stone} stone, from the store and your pack — ${d.stone - st} short. Break the grey rocks`;
          return `Raise the ${d.name.toLowerCase()}`;
        },
        onHoldTick: (dt, t) => { if (Math.floor(t * 2.6) !== Math.floor((t - dt) * 2.6)) sfx("hammer"); },
        use: () => { if (M.carry > 0 && e.q.logs < d.wood) M.net.send({ t: "deliver", id: q.id }); else if (e.q.logs >= d.wood) M.net.send({ t: "raise", id: q.id }); } });
      this.sites.set(q.id, e);
    }
    e.q = q;
    // (the logs brought, heaped beside it: more as more come)
    const k = Math.min(6, Math.ceil(q.logs / Math.max(1, d.wood) * 6));
    if (k !== e.n) { e.n = k; e.heap.clear(); if (k) e.heap.add(makeLogs(Array.from({ length: k }, (_, i) => ({ x: (i % 3 - 1) * 0.3, y: 0.15 + Math.floor(i / 3) * 0.26, z: 0, len: 1.8, r: 0.15, dir: "z" })), 7)); }
    // (the sign over it: what it has and what it wants)
    const ready = q.logs >= d.wood, rows = [["store", `${Math.min(q.logs, d.wood)} / ${d.wood} logs`, q.logs >= d.wood]];
    if (d.stone) rows.push(["stone", `${d.stone} stone`, false]);
    if (ready) rows.push(["", "Raise it — hold F", true]);
    const sig = JSON.stringify(rows);
    if (sig !== e.sig) { e.sig = sig; if (e.sign) e.g.remove(e.sign); e.sign = siteSign(rows, ready); e.sign.position.set(0, 3.0 + rows.length * 0.28, 0); e.g.add(e.sign); }
  }
  dropSite(id) { const e = this.sites.get(id); if (!e) return; this.w.root.remove(e.g); this.w.removeInteract(e.it); this.sites.delete(id); }
  // the world map, and a click on it: where you'd like to begin. (The server finds dry land near where you pointed)
  chooseStart() {
    if (G.mp !== this || $("mpStart")) return;
    const w = this.w, sheet = w.mapSheet(), half = w.half;
    const box = document.createElement("div"); box.id = "mpStart";
    box.innerHTML = `<div class="ms-win"><div class="ms-title">Where in the world will you begin?</div><div class="ms-note">Click anywhere on land. You can travel anywhere from there — but your first homestead will be near it.</div><div class="ms-map"><canvas></canvas><div class="ms-pin"></div></div><div class="ms-acts"><span class="ms-where"></span><button class="btn" data-k="stay">Stay where I am</button><button class="btn primary" data-k="go" disabled>Begin here</button></div></div>`;
    document.body.appendChild(box);
    const cv = box.querySelector("canvas"), S = Math.min(720, innerWidth - 80, (innerHeight - 220) * 1);
    cv.width = cv.height = S; cv.getContext("2d").drawImage(sheet.cv, 0, 0, S, S);
    // (your own place on it now)
    const ctx = cv.getContext("2d"), me = G.player.pos, X = x => (x + half) / (2 * half) * S, Z = z => (z + half) / (2 * half) * S;
    ctx.fillStyle = "#9a2b1c"; ctx.beginPath(); ctx.arc(X(me.x), Z(me.z), 4, 0, 7); ctx.fill();
    let pick = null;
    const pin = box.querySelector(".ms-pin"), go = box.querySelector('[data-k="go"]'), where = box.querySelector(".ms-where");
    if (document.pointerLockElement) document.exitPointerLock();
    G.menuLock = true;
    cv.onclick = e => {
      const r = cv.getBoundingClientRect(), px = (e.clientX - r.left) / r.width, pz = (e.clientY - r.top) / r.height;
      const x = -half + px * 2 * half, z = -half + pz * 2 * half, h = w.land.heightAt(x, z);
      pin.style.left = (px * 100) + "%"; pin.style.top = (pz * 100) + "%"; pin.style.display = "block";
      if (h < 0.5) { pick = null; go.disabled = true; where.textContent = "That's the sea."; return; }
      pick = { x, z }; go.disabled = false;
      const lat = -z / half * 180, lon = x / half * 180, b = w.land.biomeAt(x, z);
      where.textContent = `${Math.abs(lat).toFixed(0)}° ${lat >= 0 ? "N" : "S"}, ${Math.abs(lon).toFixed(0)}° ${lon >= 0 ? "E" : "W"} — ${(BIOMES[b] || {}).name || b}`;
    };
    const close = () => { box.remove(); G.menuLock = false; G.lockMouse && G.lockMouse(); };
    box.querySelector('[data-k="stay"]').onclick = close;
    go.onclick = () => { if (!pick) return; this.net.send({ t: "spawnAt", x: +pick.x.toFixed(1), z: +pick.z.toFixed(1) }); UI.fade && UI.fade(1, 0.3); setTimeout(() => UI.fade && UI.fade(0, 1.2), 900); close(); };
  }
  // ---- boats: a rowboat, or a ship from a shipyard; on the water, riding the swell; at the helm you row or sail it,
  // aboard as crew you go where it goes ----
  setBoat(o) {
    let e = this.boats.get(o.id);
    if (!e) {
      const g = new THREE.Group();
      if (o.kind === "ship") { const m = modelCopy("ship"); g.add(m ? m.scene : makeShip(20)); }
      else g.add(makeRowboat());
      g.traverse(q => { if (q.isMesh) q.castShadow = true; });
      this.w.root.add(g);
      e = { o, g, cur: { x: o.x, z: o.z, yaw: o.yaw || 0 }, ph: 0 };
      const M = this;
      e.it = this.w.addInteract({ get x() { return e.cur.x; }, get z() { return e.cur.z; }, get y() { return WATER + (e.o.kind === "ship" ? 2.4 : 0.9); }, reach: o.kind === "ship" ? 13 : 5, local: true,
        can: () => !M.dead && !M.aboard && !(e.o.kind === "rowboat" && e.o.driver),
        label: () => e.o.kind === "ship" ? (e.o.driver ? "Go aboard the ship" : "Take the ship's helm") : "Get in the rowboat and row",
        use: () => M.net.send({ t: "board", id: e.o.id }) });
      this.boats.set(o.id, e);
    }
    const mine = this.aboard && this.aboard.e === e && this.aboard.helm;
    e.o = { ...o, ...(mine ? { x: e.cur.x, z: e.cur.z, yaw: e.cur.yaw } : {}) };
    const helm = o.driver === this.pid, crew = (o.riders || []).includes(this.pid);
    if (helm || crew) { if (!this.aboard || this.aboard.e !== e || this.aboard.helm !== helm) this.embark(e, helm, Math.max(0, (o.riders || []).indexOf(this.pid))); }
    else if (this.aboard && this.aboard.e === e) this.disembark(false);
  }
  embark(e, helm, seat = 0) {
    const pl = G.player;
    this.aboard = { e, helm, seat, speed: 0, sendT: 0 };
    G.lockMove = true; pl.holsterAxe && pl.holsterAxe(true); if (pl.bow) pl.showBow(false);
    const ship = e.o.kind === "ship";
    UI.keys(helm ? [["W / S", ship ? "make sail, or take it in" : "row, or back water"], ["A / D", ship ? "put the helm over" : "pull round"], ["F", "step ashore, at the shore"]] : [["F", "step ashore, at the shore"]], 8);
    UI.hint(helm ? (ship ? "You've the helm. W to make sail, A and D to steer — and F to go ashore when she's in by the land." : "In the boat. W to row, S to back water, A and D to pull round; F to step out at the shore.") : "Aboard. You go where she goes; F to step ashore when she's in by the land.", 4);
  }
  disembark(tell = true) {
    const a = this.aboard; if (!a) return;
    this.aboard = null; G.lockMove = false;
    if (tell) this.net.send({ t: "unboard" });
  }
  tickBoats(dt) {
    const w = this.w, pl = G.player;
    for (const e of this.boats.values()) {
      const B = BOATS[e.o.kind], mine = this.aboard && this.aboard.e === e && this.aboard.helm;
      if (!mine) {
        // (someone else's, or nobody's: eased to where the server has it)
        const k = Math.min(1, dt * 4), dyaw = Math.atan2(Math.sin(e.o.yaw - e.cur.yaw), Math.cos(e.o.yaw - e.cur.yaw));
        if (Math.hypot(e.o.x - e.cur.x, e.o.z - e.cur.z) > 30) { e.cur.x = e.o.x; e.cur.z = e.o.z; }
        e.cur.x += (e.o.x - e.cur.x) * k; e.cur.z += (e.o.z - e.cur.z) * k; e.cur.yaw += dyaw * k;
        e.spd = Math.hypot(e.o.x - e.cur.x, e.o.z - e.cur.z) * 4;
      }
      // riding the swell: lifted and dropped, pitching and rolling with the slope of it
      const fx = Math.sin(e.cur.yaw), fz = Math.cos(e.cur.yaw), L = B.len * 0.4, Wd = e.o.kind === "ship" ? 2.4 : 0.6;
      const h = waveAt(w.wm, e.cur.x, e.cur.z), hb = waveAt(w.wm, e.cur.x + fx * L, e.cur.z + fz * L), hs = waveAt(w.wm, e.cur.x - fx * L, e.cur.z - fz * L);
      const hl = waveAt(w.wm, e.cur.x + fz * Wd, e.cur.z - fx * Wd), hr = waveAt(w.wm, e.cur.x - fz * Wd, e.cur.z + fx * Wd);
      e.y = WATER - 0.05 + h - (e.o.kind === "ship" ? 0.2 : 0.05);
      e.g.position.set(e.cur.x, e.y, e.cur.z);
      e.g.rotation.set(Math.atan2(hs - hb, 2 * L) * (e.o.kind === "ship" ? 0.5 : 1), e.cur.yaw, Math.atan2(hl - hr, 2 * Wd) * (e.o.kind === "ship" ? 0.6 : 1), "YXZ");
      // (a rowboat's oars, swung as it's rowed)
      const oars = e.g.children[0] && e.g.children[0].userData.oars;
      if (oars) { const spd = mine ? Math.abs(this.aboard.speed) : e.spd || 0; e.ph += dt * (spd > 0.2 ? 3.2 : 0); oars.forEach((o, i) => { o.rotation.y = spd > 0.2 ? Math.sin(e.ph) * 0.6 * (i ? -1 : 1) : o.rotation.y * 0.9; o.rotation.z = (i ? 0.32 : -0.32) + (spd > 0.2 ? Math.cos(e.ph) * 0.12 * (i ? 1 : -1) : 0); }); }
    }
    const a = this.aboard; if (!a) return;
    const e = a.e, B = BOATS[e.o.kind];
    if (this.dead || !this.boats.has(e.o.id)) { this.disembark(); return; }
    if (a.helm) {
      // at the helm: W and S to row (or to make and take in sail), A and D to turn — quicker the faster she goes
      const want = input.down("KeyW") ? B.speed : input.down("KeyS") ? -B.speed * 0.35 : 0;
      a.speed += (want - a.speed) * Math.min(1, dt * (e.o.kind === "ship" ? 0.35 : 1.4));
      const turn = (input.down("KeyA") ? 1 : 0) - (input.down("KeyD") ? 1 : 0);
      e.cur.yaw += turn * B.turn * dt * (0.35 + 0.65 * Math.min(1, Math.abs(a.speed) / B.speed)) * Math.sign(a.speed || 1);
      const nx = e.cur.x + Math.sin(e.cur.yaw) * a.speed * dt, nz = e.cur.z + Math.cos(e.cur.yaw) * a.speed * dt;
      // (aground: she won't go on, into the shallows or onto the land)
      const ahead = (k) => w.land.heightAt(nx + Math.sin(e.cur.yaw) * B.len * 0.5 * k, nz + Math.cos(e.cur.yaw) * B.len * 0.5 * k);
      if (ahead(Math.sign(a.speed || 1)) > -B.draft || w.land.heightAt(nx, nz) > -B.draft) { if (Math.abs(a.speed) > 0.6) { sfx("build"); } a.speed = 0; }
      else { e.cur.x = nx; e.cur.z = nz; }
      if ((a.sendT -= dt) <= 0) { a.sendT = 0.15; this.net.send({ t: "boatmv", id: e.o.id, x: +e.cur.x.toFixed(2), z: +e.cur.z.toFixed(2), yaw: +e.cur.yaw.toFixed(3) }); }
    }
    // where you are aboard: at the oars, at the ship's helm by the stern, or along her deck
    const ship = e.o.kind === "ship", fx = Math.sin(e.cur.yaw), fz = Math.cos(e.cur.yaw), sx = Math.cos(e.cur.yaw), sz = -Math.sin(e.cur.yaw);
    // (the helmsman up on the stern castle, where he can see over the waist and the bow)
    const along = ship ? (a.helm ? -8.6 : 4 - (a.seat % 4) * 3) : -0.1, across = ship && !a.helm ? (a.seat < 4 ? -1.2 : 1.2) : 0;
    pl.pos.set(e.cur.x + fx * along + sx * across, e.y + (ship ? (a.helm ? 4.3 : 2.6) : -0.45), e.cur.z + fz * along + sz * across); pl.vy = 0; pl.vel && pl.vel.set(0, 0, 0);
    // F: ashore, if there's land close enough to step onto
    if (input.hit("KeyF") && G.mode === "play" && !UI.dialogOpen) {
      let land = null;
      for (let r = 1.5; r <= (ship ? 16 : 7) && !land; r += 1) for (let k = 0; k < 16 && !land; k++) { const ang = k / 16 * Math.PI * 2, x = pl.pos.x + Math.cos(ang) * r, z = pl.pos.z + Math.sin(ang) * r; if (w.land.heightAt(x, z) > 0.4) land = { x, z }; }
      if (!land) UI.hint(ship ? "Too far from the land to go ashore — bring her in closer." : "Row in to the shore to step out.", 2.5);
      else { this.disembark(); pl.place(land.x, land.z, pl.yaw); w.buildNear(land.x, land.z, 99); sfx("build"); }
    }
  }
  // an arrow in one of the wild beasts: told to the server, which has it fall, or run, or turn on you
  huntHit(a, power, head) { if (a && a.netId) this.net.send({ t: "hunthit", id: a.netId, power: +(+power || 0.5).toFixed(2), head: !!head }); }
  // a beast brought down, dressed where it lies (its meat into your pack)
  dressBeast(a) { if (a && a.netId) { this.net.send({ t: "dress", id: a.netId }); window.__foley && window.__foley.packIn(0.35); } }
  packHas() { const k = this.pack; return !!k && ((k.stone | 0) > 0 || (k.food | 0) > 0); }
  addDrop(d) {
    // (a sack already lying there, with less in it now: what it holds is updated)
    if (d && this.drops.has(d.id)) { Object.assign(this.drops.get(d.id).d, d); return; }
    if (!d) return;
    const mesh = new THREE.Group(), s1 = makeSack(), s2 = makeSack();
    s1.scale.setScalar(2.3); s2.scale.setScalar(1.7); s2.position.set(0.25, 0, 0.18); s2.rotation.z = 1.2; mesh.add(s1, s2);
    mesh.position.set(d.x, this.w.heightAt(d.x, d.z), d.z); mesh.rotation.y = (d.x * 7.3) % 6.28; this.w.root.add(mesh);
    const it = this.w.addInteract({ x: d.x, y: this.w.heightAt(d.x, d.z) + 0.4, z: d.z, reach: 2.6, can: () => !this.dead,
      label: () => `${d.owner === this.pid ? "Take back your sack" : `Loot ${d.name}'s sack`} — ${goodsText(d)}`, use: () => this.net.send({ t: "loot", id: d.id }) });
    this.drops.set(d.id, { d, mesh, it });
  }
  leave(quiet) {
    if (this.hunt) { this.hunt.stop(); this.hunt = null; }
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
    G.onSwing = null; G.onMine = null; G.onFrame.length = 0; G.downed = false; G.lockMove = false;
    G.mp = null;
  }
}
