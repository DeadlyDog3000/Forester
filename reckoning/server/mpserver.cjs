// ===========================================================================
//  FORESTER: RECKONING — Copyright (c) 2026 Roan Fraese / DeadlyDog Productions
// ===========================================================================

// THE MULTIPLAYER SERVER. One program does all of it:
//  - the games people host: each its own map, from a seed and a kind of country, gone a while after the last leaves;
//  - the wide world: one great map for everyone, kept on disk, where what you build stays;
//  - and the list of both, for the lobby.
// It keeps what matters (who felled which tree, what stands where and who owns it, everyone's logs and stone, who is
// allied with whom) and checks what it's told against the same rules the players have (js/mp/rules.js). Where people
// are and which way they face it only passes on.
//
// No packages needed: plain Node, its own small WebSocket. Run it on its own as the wide world's server:
//     node mpserver.cjs --port 8080 --world --data ./world-data
// or from inside the app (shell.js), to host a game on your own network.

const http = require("http"), crypto = require("crypto"), fs = require("fs"), path = require("path"), dgram = require("dgram"), os = require("os");
const { pathToFileURL } = require("url");

let R = null, T = null, LK = null, F = null;
const CARRY_MAX = 6;                   // (logs in your arms at once, as in the settlement)
// what a player carries on their back, as in the settlement: what they gather goes in here, not into the stores, till
// they empty it at the town hall or a woodshed
const PACK_MAX = 40;
let START = null;                    // (a test server can start everyone rich: --stock 200)              // the rules and the land (ES modules, shared with the game: loaded at start)
const LAN_PORT = 47811;

// ---------------------------------------------------------------------------
//  a small WebSocket (RFC 6455): text frames, ping and pong, close
// ---------------------------------------------------------------------------
const GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";
class Sock {
  constructor(socket) {
    this.s = socket; this.buf = Buffer.alloc(0); this.frag = null; this.open = true;
    this.onmessage = null; this.onclose = null;
    socket.setNoDelay(true);
    socket.on("data", d => { this.buf = Buffer.concat([this.buf, d]); try { this.parse(); } catch (e) { this.close(); } });
    socket.on("close", () => this.gone());
    socket.on("error", () => this.gone());
  }
  gone() { if (!this.open) return; this.open = false; if (this.onclose) this.onclose(); }
  parse() {
    for (;;) {
      const b = this.buf; if (b.length < 2) return;
      const fin = b[0] & 0x80, op = b[0] & 0x0f, masked = b[1] & 0x80;
      let len = b[1] & 0x7f, o = 2;
      if (len === 126) { if (b.length < 4) return; len = b.readUInt16BE(2); o = 4; }
      else if (len === 127) { if (b.length < 10) return; const big = b.readBigUInt64BE(2); if (big > 1n << 25n) throw new Error("too big"); len = Number(big); o = 10; }
      if (len > 1 << 25) throw new Error("too big");     // (a colony's whole state, sent to someone joining, can run to megabytes)
      const mo = o; if (masked) o += 4;
      if (b.length < o + len) return;
      let data = b.subarray(o, o + len);
      if (masked) { const m = b.subarray(mo, mo + 4); data = Buffer.from(data); for (let i = 0; i < data.length; i++) data[i] ^= m[i & 3]; }
      this.buf = b.subarray(o + len);
      if (op === 8) { this.raw(0x88, Buffer.alloc(0)); this.s.end(); this.gone(); return; }
      if (op === 9) { this.raw(0x8a, data); continue; }
      if (op === 10) continue;
      if (op === 1 || op === 2) { if (fin) this.deliver(data); else this.frag = [data]; continue; }
      if (op === 0 && this.frag) { this.frag.push(data); if (fin) { const all = Buffer.concat(this.frag); this.frag = null; this.deliver(all); } }
    }
  }
  // (a fault in handling one message is the server's, not the player's: it's written down, and they stay connected —
  //  it used to throw out to the frame parser, which hung up on them without a word)
  deliver(data) {
    if (process.env.MP_DEBUG && data.length > 100000) console.log(`big message ${data.length}`);
    if (!this.onmessage) return;
    try { this.onmessage(data.toString("utf8")); }
    catch (e) { console.error(`[${new Date().toISOString()}] a message went wrong: ${String(data).slice(0, 120)}\n${e.stack}`); }
  }
  raw(head, data) {
    if (!this.open) return;
    const n = data.length, h = n < 126 ? Buffer.from([head, n]) : n < 65536 ? Buffer.from([head, 126, n >> 8, n & 255]) : (() => { const x = Buffer.alloc(10); x[0] = head; x[1] = 127; x.writeBigUInt64BE(BigInt(n), 2); return x; })();
    try { this.s.write(Buffer.concat([h, data])); } catch (e) {}
  }
  send(obj) { this.raw(0x81, Buffer.from(typeof obj === "string" ? obj : JSON.stringify(obj))); }
  close() { try { this.raw(0x88, Buffer.alloc(0)); this.s.end(); } catch (e) {} this.gone(); }
}
function upgrade(req, socket) {
  const key = req.headers["sec-websocket-key"];
  if (!key) { socket.destroy(); return null; }
  const acc = crypto.createHash("sha1").update(key + GUID).digest("base64");
  socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${acc}\r\n\r\n`);
  return new Sock(socket);
}

// ---------------------------------------------------------------------------
//  the games
// ---------------------------------------------------------------------------
const pidOf = token => crypto.createHash("sha256").update("reckoning:" + token).digest("hex").slice(0, 12);
// a username: letters, digits, _ . - only, lower case, up to 20 (so it can be typed after /invite, and matched)
const userOf = s => String(s == null ? "" : s).toLowerCase().replace(/[^a-z0-9_.-]/g, "").slice(0, 20);
const clean = (s, n) => String(s == null ? "" : s).replace(/[\u0000-\u001f<>]/g, "").trim().slice(0, n);
const num = (v, d = 0) => (Number.isFinite(+v) ? +v : d);
const now = () => Date.now();

class Room {
  constructor(o) {
    this.id = o.id || crypto.randomBytes(4).toString("hex");
    this.name = clean(o.name, 40) || "A game in the woods";
    this.mode = R.MODES[o.mode] || o.mode === "colony" || o.mode === "nations" ? o.mode : "coop";
    this.hostPid = o.hostPid || null;
    this.banned = new Map(Object.entries(o.banned || {}));   // (pid → name: the ones the host has turned away)        // (a colony game: the one whose game it is, and runs it)
    this.max = Math.max(1, Math.min(o.persistent ? 500 : 16, num(o.max, 8) | 0));
    this.kind = T.TERRAINS[o.kind] ? o.kind : "island";
    this.size = R.SIZES[o.size] ? o.size : "m";
    this.half = o.half || R.SIZES[this.size];
    if (this.kind === "earth" && !o.half) this.half = R.EARTH_SIZES[this.size];   // (the whole world wants room to be seen: a long way across)
    this.seed = num(o.seed, crypto.randomInt(1, 2 ** 31 - 1)) | 0;
    this.persistent = !!o.persistent;
    this.password = o.password ? String(o.password).slice(0, 40) : "";
    // (a private game: only for its host and those they've invited — by name, or by who they are)
    this.private = !!o.private;
    this.invited = new Set((Array.isArray(o.invite) ? o.invite : []).map(x => String(x).trim().toLowerCase()).filter(Boolean).slice(0, 64));
    this.host = clean(o.host, 24); this.hostUser = userOf(o.hostUser) || null;
    this.created = now(); this.emptySince = now();
    this.land = T.makeTerrain(this.seed, this.half, this.kind);
    this.online = new Map();           // pid → {sock, pid, name, look, x, y, z, yaw, a, h, hp, dead, ...}
    this.recs = {};                    // pid → {name, look, wood, stone, home, kills, deaths, seen, group}
    this.felled = {}; this.broken = {}; // id → when it grows back
    this.hits = new Map();             // a tree or a rock part-way through: id → blows so far
    this.buildings = {};
    this.groups = {};                  // group id → {name, members: [pid]}
    // THE NATIONS (Frontier): whoever raises a town hall is crowned its monarch; others join by invitation, as a
    // citizen or a governor. monarch pid → {name, title, founded, members: {pid: "monarch" | "governor" | "citizen"}}
    this.nations = {}; this.natAsk = new Map();
    this.invites = new Map();          // invited pid → {from, at}
    this.chat = [];
    this.nextB = 1;
    this.day0 = now() - R.DAY_MS * (START && START.hour != null ? START.hour : 0.3);   // (in the morning, in fact)
    this.spawnAt = this.land.findHome(T.seq(this.seed ^ 0x5eed), [], 0);
    this.shared = { ...(START || R.START_STOCK) };   // (co-op: one colony, one store)
    this.settlers = {}; this.nextS = 1; this.lastArrive = {}; this.workCache = {};
    this.wars = []; this.news = []; this.lastWar = {};
    this.drops = {}; this.nextD = 1;
    this.beasts = {}; this.nextA = 1;
    this.boats = {}; this.nextO = 1;   // (boats on the water: rowboats, and ships from the shipyards)   // (the wild beasts round the players: kept here, so everyone sees the same ones)
    // (as in the settlement: a tree's logs lie where it fell, to be carried; a building is a site till the logs are
    //  brought and it's raised)
    this.piles = {}; this.nextP = 1; this.sites = {};     // (what the fallen dropped: a sack each, for anyone to loot, a few minutes)
    // Classic: a nation each, each the real game on its owner's computer; here only what passes between them
    this.nats = {}; this.pacts = new Set(); this.nwars = []; this.offers = new Map(); this.forays = new Map(); this.peaceAsk = new Map(); this.pactAsk = new Map(); this.lastNWar = {}; this.nextO = 1;
    this.dirty = false;
  }
  storeOf(pid) { return this.mode === "coop" ? this.shared : this.recs[this.natOf(pid) || pid] || this.recs[pid]; }
  // ---- the nations ----
  natOf(pid) { if (this.nations[pid]) return pid; const r = this.recs[pid], n = r && r.nation; return n && this.nations[n] && this.nations[n].members[pid] ? n : null; }
  roleOf(pid) { const n = this.natOf(pid); return n ? this.nations[n].members[pid] : null; }
  sameNation(a, b) { const n = this.natOf(a); return !!n && n === this.natOf(b); }
  natSend() { this.all({ t: "nations", nations: this.nations }); this.dirty = true; }
  // a town hall raised: its builder crowned (and in a co-op colony, everyone in it their people)
  crown(p) {
    if (this.natOf(p.pid) || this.mode === "nations") return;
    const f = !!(LK && LK.isF && LK.isF(p.look)), title = f ? "Queen" : "King";
    const n = this.nations[p.pid] = { name: `${p.name}'s Realm`, title, founded: Math.floor((now() - this.day0) / R.DAY_MS) + 1, members: { [p.pid]: "monarch" } };
    this.recs[p.pid].nation = p.pid;
    if (this.mode === "coop") for (const pid of Object.keys(this.recs)) if (pid !== p.pid && !this.natOf(pid)) { n.members[pid] = "citizen"; this.recs[pid].nation = p.pid; }
    this.headline("crown", `${p.name} is crowned ${title} of ${n.name}.`);
    p.sock.send({ t: "crowned", title, name: n.name });
    this.natSend();
  }
  natLeave(pid) {
    const n = this.natOf(pid); if (!n || n === pid) return;
    delete this.nations[n].members[pid]; if (this.recs[pid]) this.recs[pid].nation = null;
    // (what they carry stays theirs; their own store starts again from nothing — the nation's stays the nation's)
    const r = this.recs[pid]; if (r) { r.wood = r.wood || 0; r.stone = r.stone || 0; }
    const q = this.online.get(pid); if (q) this.stock(q);
  }
  addPile(x, z, a, n, kind) {
    // (onto a pile already lying close by, rather than a heap of little ones)
    const near = Object.values(this.piles).find(q => Math.hypot(q.x - x, q.z - z) < 1.2);
    if (near) { near.n += n; this.all({ t: "pile", p: near }); return near; }
    const pl = { id: "p" + (this.nextP++), x: +x.toFixed(2), z: +z.toFixed(2), a: +a.toFixed(2), n, ...(kind === "birch" ? { k: kind } : {}) };
    this.piles[pl.id] = pl; this.all({ t: "pile", p: pl });
    return pl;
  }
  // who runs the settlement: in co-op, the host alone; otherwise each their own
  // (who may run the settlement's affairs — rebuild the hall, set the settlers to work: in a nation its monarch and
  //  governors; in a co-op colony with no crown yet, its host)
  manages(p) { const r = this.roleOf(p.pid); if (r) return r === "monarch" || r === "governor"; return this.mode !== "coop" || !this.hostPid || p.pid === this.hostPid; }
  meta() {
    return { id: this.id, name: this.name, mode: this.mode, kind: this.mode === "colony" || this.mode === "nations" ? "woods" : this.kind, size: this.size, half: this.half, players: this.online.size, max: this.max, host: this.host, hostUser: this.hostUser || null, hostPid: this.hostPid, locked: !!this.password, persistent: this.persistent, private: this.private };
  }
  // ---- saving the wide world ----
  toJSON() { return { news: this.news.slice(-60), settlers: Object.fromEntries(Object.entries(this.settlers).map(([k, v]) => [k, { id: v.id, owner: v.owner, name: v.name, look: v.look, job: v.job, x: v.x, z: v.z, hp: v.hp, pin: v.pin || null }])), nextS: this.nextS, shared: this.shared, id: this.id, name: this.name, mode: this.mode, kind: this.kind, half: this.half, seed: this.seed, max: this.max, persistent: true, recs: this.recs, felled: this.felled, broken: this.broken, buildings: this.buildings, groups: this.groups, nations: this.nations, nextB: this.nextB, day0: this.day0, banned: Object.fromEntries(this.banned), piles: this.piles, nextP: this.nextP, sites: this.sites, boats: Object.fromEntries(Object.entries(this.boats).map(([k, b]) => [k, { ...b, driver: null, riders: [] }])), nextO: this.nextO }; }
  static from(j) {
    const r = new Room(j);
    Object.assign(r, { news: j.news || [], settlers: Object.fromEntries(Object.entries(j.settlers || {}).map(([k, v]) => [k, { ...v, state: "find", a: "idle", yaw: 0, s: 0 }])), nextS: j.nextS || 1, shared: j.shared || r.shared, recs: j.recs || {}, felled: j.felled || {}, broken: j.broken || {}, buildings: j.buildings || {}, groups: j.groups || {}, nations: j.nations || {}, nextB: j.nextB || 1, day0: j.day0 || r.day0, piles: j.piles || {}, nextP: j.nextP || 1, sites: j.sites || {}, boats: j.boats || {}, nextO: j.nextO || 1, banned: new Map(Object.entries(j.banned || {})) });
    return r;
  }
  each(f) { for (const p of this.online.values()) f(p); }
  all(msg, except) { const s = JSON.stringify(msg); for (const p of this.online.values()) if (p !== except) p.sock.send(s); }
  pub(p) { const r = this.recs[p.pid]; return { pid: p.pid, name: p.name, user: p.user || null, look: p.look, x: p.x, y: p.y, z: p.z, yaw: p.yaw, hp: p.hp, dead: p.dead, group: r && r.group || null }; }
  // ---- who may hurt whom ----
  allied(a, b) {
    if (a === b) return true;
    if (this.mode === "coop") return true;
    if (this.sameNation(a, b)) return true;
    const ga = this.recs[a] && this.recs[a].group, gb = this.recs[b] && this.recs[b].group;
    return !!ga && ga === gb;
  }
  // the ground someone has claimed with a town hall, at a point (or null)
  claimAt(x, z) {
    for (const b of Object.values(this.buildings)) {
      const d = R.BUILD[b.type]; if (!d || !d.claim) continue;
      if (Math.hypot(b.x - x, b.z - z) < R.claimOf(b)) return b;
    }
    return null;
  }
  join(sock, who, password) {
    if (this.banned.has(who.pid)) return sock.send({ t: "err", text: `${this.host || "The host"} has banned you from this game.` });
    if (this.password && password !== this.password) return sock.send({ t: "err", text: "That game has a password, and that wasn't it." });
    if (!this.canSee(who)) return sock.send({ t: "err", text: "That game is private. Ask its host to invite you." });
    if (this.online.has(who.pid)) { const old = this.online.get(who.pid); old.sock.send({ t: "err", text: "You've joined from somewhere else." }); this.leave(old); }
    if (this.online.size >= this.max) return sock.send({ t: "err", text: "That game is full." });
    let rec = this.recs[who.pid];
    if (!rec) rec = this.recs[who.pid] = { name: who.name, look: who.look, ...(START || R.START_STOCK), home: null, kills: 0, deaths: 0, group: null, first: now() };
    rec.name = who.name; rec.look = who.look; rec.seen = now(); rec.food ??= R.START_STOCK.food; this.shared.food ??= R.START_STOCK.food;
    // where you come in: your town hall if it still stands; else (in a game among friends) beside the others, or
    // (in a fight, and the wide world) somewhere of your own, well away from everyone
    const hearth = Object.values(this.buildings).find(b => b.type === "hearth" && (b.owner === who.pid || this.mode === "coop"));
    let at;
    if (hearth) at = { x: hearth.x + 3, z: hearth.z + 3 };
    else if (this.mode === "coop" && !this.persistent) at = this.land.findHome(T.seq(crypto.randomInt(1, 1e9)), [], 0, this.spawnAt, 30);
    else at = this.land.findHome(T.seq(crypto.randomInt(1, 1e9)), Object.values(this.buildings).filter(b => b.type === "hearth").concat([...this.online.values()]), this.persistent ? 260 : 120);
    const p = { sock, pid: who.pid, user: who.user || null, name: who.name, look: who.look, x: at.x, y: this.land.heightAt(at.x, at.z), z: at.z, yaw: 0, a: "idle", h: "axe", s: 0, hp: R.MAX_HP, dead: false, shield: now() + R.SPAWN_SHIELD_MS, lastBlow: 0, lastHit: 0, room: this };
    this.online.set(p.pid, p); sock.player = p; this.emptySince = 0;
    const live = (o, t) => Object.keys(o).filter(k => o[k] > t);
    const t = now();
    sock.send({ t: "in", room: { ...this.meta(), seed: this.seed }, you: { pid: p.pid, x: p.x, z: p.z, wood: this.storeOf(p.pid).wood, stone: this.storeOf(p.pid).stone, food: this.storeOf(p.pid).food | 0, shield: R.SPAWN_SHIELD_MS, home: hearth ? hearth.id : null, pack: { ...this.packOf(p.pid) } },
      players: [...this.online.values()].filter(q => q !== p).map(q => this.pub(q)), felled: live(this.felled, t), broken: live(this.broken, t),
      buildings: Object.values(this.buildings), drops: Object.values(this.drops), piles: Object.values(this.piles), sites: Object.values(this.sites), boats: Object.values(this.boats), carry: (this.recs[p.pid] || {}).carry || 0, nations: this.nations, settlers: Object.values(this.settlers).map(x => this.pubS(x)), wars: this.wars, news: this.news.slice(-30), groups: this.groups, day: { t: (t - this.day0) % R.DAY_MS, len: R.DAY_MS }, chat: this.chat.slice(-20),
      online: this.onlineNames(), ...(this.mode === "nations" ? this.natState() : {}) });
    this.all({ t: "pj", p: this.pub(p) }, p);
    this.sendPack(p);
    if (process.env.MP_DEBUG) console.log(`join ${this.id} ${p.name} ${p.pid} host=${this.hostPid}`);
    this.note(`${p.name} has come.`, p);
    // (in a co-op colony with a crown, a newcomer is one of its people)
    if (this.mode === "coop" && !this.natOf(p.pid)) { const n = Object.keys(this.nations)[0]; if (n) { this.nations[n].members[p.pid] = "citizen"; this.recs[p.pid].nation = n; this.natSend(); } }
    this.dirty = true;
  }
  // may this person see (and join) the game? A public one, anyone; a private one, its host and whoever's invited
  canSee(who) {
    if (!this.private || !who) return !this.private;
    return who.pid === this.hostPid || this.invited.has(String(who.pid || "")) || (!!who.user && this.invited.has(who.user)) || (!who.user && this.invited.has(String(who.name || "").trim().toLowerCase()));
  }
  invite(p, m) {
    const no = text => p.sock.send({ t: "err", text });
    if (!this.hostPid || p.pid !== this.hostPid) return no("Only the host can invite people.");
    const names = String(m.names || m.name || "").split(",").map(x => x.trim()).filter(Boolean).slice(0, 16);
    if (!names.length) return no("Invite whom? /invite username, or several: /invite ann, bert");
    for (const n of names) this.invited.add(userOf(n.replace(/^@/, "")) || n.toLowerCase());
    this.dirty = true;
    return p.sock.send({ t: "note", text: `Invited: ${names.join(", ")}. ${this.private ? "They'll find the game on their list now." : "(The game's open to anyone anyway.)"}` });
  }
  turnAway(p, m) {
    const no = text => p.sock.send({ t: "err", text });
    if (!this.hostPid || p.pid !== this.hostPid) return no("Only the host can do that.");
    const key = String(m.pid || ""), name = String(m.name || "").trim().toLowerCase();
    if (m.t === "unban") {
      const hit = [...this.banned].find(([pid, n]) => pid === key || n.toLowerCase() === name);
      if (!hit) return no("There's nobody of that name banned.");
      this.banned.delete(hit[0]); this.dirty = true;
      return p.sock.send({ t: "note", text: `${hit[1]} may come back now.` });
    }
    const q = this.online.get(key) || [...this.online.values()].find(x => x.name.toLowerCase() === name);
    if (!q) return no(m.t === "ban" ? "There's nobody here of that name." : "There's nobody here of that name.");
    if (q === p) return no("That's you.");
    if (m.t === "ban") { this.banned.set(q.pid, q.name); this.dirty = true; }
    const why = m.t === "ban" ? `${this.host || "The host"} has banned you from this game.` : `${this.host || "The host"} has sent you away from this game.`;
    try { q.sock.send({ t: "kicked", text: why }); } catch (e) {}
    this.leave(q);
    setTimeout(() => { try { q.sock.close(); } catch (e) {} }, 300);
    this.note(m.t === "ban" ? `${q.name} has been banned by ${p.name}.` : `${q.name} has been sent away by ${p.name}.`);
  }
  onlineNames() { return [...this.online.values()].map(q => q.pid); }
  leave(p) {
    if (!this.online.has(p.pid) || this.online.get(p.pid) !== p) return;
    this.online.delete(p.pid); p.sock.player = null;
    if (process.env.MP_TRACE) console.log(`left "${this.name}": ${p.name} ${new Error().stack.split("\n").slice(2, 4).map(x => x.trim()).join(" < ")}`);
    // (their place in a boat, given up)
    for (const o of Object.values(this.boats || {})) { if (o.driver === p.pid) { o.driver = (o.riders || []).shift() || null; this.all({ t: "boat", o }); } else if ((o.riders || []).includes(p.pid)) { o.riders = o.riders.filter(q => q !== p.pid); this.all({ t: "boat", o }); } }
    const r = this.recs[p.pid]; if (r) r.seen = now();
    this.all({ t: "pl", pid: p.pid });
    if (this.mode === "colony" && p.pid === this.hostPid) { this.all({ t: "ended", text: `${p.name} has closed the colony.` }); this.ended = true; }
    if (this.mode === "nations") this.natGone(p.pid);
    this.note(`${p.name} has gone.`);
    if (!this.online.size) this.emptySince = now();
    this.dirty = true;
  }
  note(text, except) { this.all({ t: "note", text }, except); }
  // the game's news: what everyone hears of — wars, homesteads taken, alliances, deaths, the growing places
  headline(kind, text) {
    const n = { kind, text, at: now() };
    this.news.push(n); if (this.news.length > 200) this.news.shift();
    this.all({ t: "news", n }); this.dirty = true;
  }
  // your pack: stone and food you've gathered and not yet put in the stores
  // what's in your pack: stone, fish (raw), game meat (raw), and food cooked at the fire
  packOf(pid) { const r = this.recs[pid]; if (!r) return { stone: 0, food: 0, meat: 0, roast: 0 }; const k = r.pack || (r.pack = { stone: 0, food: 0 }); k.meat ??= 0; k.roast ??= 0; return k; }
  packRoom(pid) { const k = this.packOf(pid); return Math.max(0, PACK_MAX - (k.stone | 0) - (k.food | 0) - (k.meat | 0) - (k.roast | 0)); }
  sendPack(p) { const k = this.packOf(p.pid); p.sock.send({ t: "pack", stone: k.stone | 0, food: k.food | 0, meat: k.meat | 0, roast: k.roast | 0, max: PACK_MAX }); }
  stock(p) {
    // (a co-op colony's store is everyone's: all are told)
    if (this.mode === "coop") { this.all({ t: "stock", wood: this.shared.wood, stone: this.shared.stone, food: this.shared.food | 0 }); return; }
    // (a nation's store is its people's: all of them that are here are told)
    const n = this.natOf(p.pid), r = this.storeOf(p.pid), msg = { t: "stock", wood: r.wood, stone: r.stone, food: r.food | 0 };
    if (n) { for (const pid of Object.keys(this.nations[n].members)) { const q = this.online.get(pid); if (q) q.sock.send(msg); } } else p.sock.send(msg);
  }
  near(p, x, z, d) { return Math.hypot(p.x - x, p.z - z) <= d; }
  // ---- what players do ----
  on(p, m) {
    const rec = this.recs[p.pid], st = this.storeOf(p.pid), t = now();
    // the host's say over who plays: sent away for now, or for good (and let back)
    if (m.t === "kick" || m.t === "ban" || m.t === "unban") return this.turnAway(p, m);
    if (m.t === "invite") return this.invite(p, m);
    if (this.mode === "nations") return this.nationsOn(p, m);
    // a colony game is the host's own game: the server only carries messages between it and the others
    if (this.mode === "colony") {
      if (process.env.MP_DEBUG && m.t === "h") console.log(`colony h from ${p.name} to ${m.to || "all"} ${m.m && m.m.t}`);
      if (m.t === "h" && p.pid === this.hostPid) {                  // host → one guest, or all of them
        const s2 = JSON.stringify({ t: "h", m: m.m });
        if (m.to) { const q = this.online.get(String(m.to)); if (q) q.sock.send(s2); }
        else for (const q of this.online.values()) if (q !== p) q.sock.send(s2);
        return;
      }
      if (process.env.MP_DEBUG && m.t !== "st") console.log(`colony msg ${m.t} from ${p.name}${m.m ? " " + m.m.t : ""}`);
      if (m.t === "g" && p.pid !== this.hostPid) {                  // a guest → the host
        const h = this.online.get(this.hostPid); if (h) h.sock.send({ t: "g", from: p.pid, name: p.name, m: m.m });
        return;
      }
      if (!["st", "chat", "respawn"].includes(m.t)) return;
    }
    switch (m.t) {
      case "st": {
        if (p.dead) return;
        const x = num(m.x, p.x), z = num(m.z, p.z);
        // (no stepping off the map, and nothing faster than a horse)
        if (Math.abs(x) > this.half + 50 || Math.abs(z) > this.half + 50) return;
        p.x = x; p.y = num(m.y, p.y); p.z = z; p.yaw = num(m.yaw, 0); p.a = clean(m.a, 12) || "idle"; p.h = clean(m.h, 10); p.s = num(m.s, 0); p.g = !!m.g; p.c = !!m.c;
        p.moved = true;
        return;
      }
      case "chop": {
        if (p.dead || t - p.lastBlow < 300) return; p.lastBlow = t;
        const tr = this.land.treeById(String(m.id || ""));
        if (!tr || p.y < -60 || this.felled[tr.id] > t || !this.near(p, tr.x, tr.z, R.REACH + 1)) return;
        const forge = this.hasForge(p.pid);
        const n = (this.hits.get(tr.id) || 0) + (forge ? 1.5 : 1);
        if (n < R.TREE_HITS[tr.kind]) { this.hits.set(tr.id, n); this.all({ t: "chip", id: tr.id, by: p.pid }, p); return; }
        this.hits.delete(tr.id);
        this.felled[tr.id] = t + R.REGROW_MS;
        const dx = tr.x - p.x, dz = tr.z - p.z, l = Math.hypot(dx, dz) || 1;
        this.all({ t: "fell", id: tr.id, by: p.pid, dx: dx / l, dz: dz / l });
        // (its logs where it comes down, a few paces out along the way it fell)
        this.addPile(tr.x + dx / l * 1.6, tr.z + dz / l * 1.6, Math.atan2(dx, dz), R.LOGS_PER_TREE[tr.kind], tr.kind);
        this.dirty = true;
        return;
      }
      case "mine": {
        if (p.dead || t - p.lastBlow < 300) return; p.lastBlow = t;
        // (a rock up top; or a seam of stone in a cave's wall — taken on trust where it lies, so long as it's one of a cave
        //  that's there and you're down in it: its halls are under its mouth, a few hundred paces about)
        let k = null; const id = String(m.id || "");
        if (id[0] === "s") { const [ci, cj, n] = id.slice(1).split(":").map(Number), cv = this.land.caveIn(ci, cj); if (cv && n >= 0 && n < 80 && p.y < -100 && Math.hypot(p.x - cv.x, p.z - cv.z) < 450) k = { id, x: p.x, z: p.z, s: 1, seam: true }; }
        else k = this.land.rockById(id);
        if (!k || this.broken[k.id] > t || !this.near(p, k.x, k.z, R.REACH + k.s + 1)) return;
        const n = (this.hits.get(k.id) || 0) + (this.hasForge(p.pid) ? 1.5 : 1);
        if (n < R.ROCK_HITS) { this.hits.set(k.id, n); this.all({ t: "chip", id: k.id, by: p.pid }, p); return; }
        this.hits.delete(k.id);
        this.broken[k.id] = t + R.REGROW_MS;
        // (into your pack, not the stores: empty it at the town hall or a woodshed)
        const per = R.STONE_PER_ROCK * (k.seam ? 2 : 1), pk = this.packOf(p.pid), got = Math.min(per, this.packRoom(p.pid));
        pk.stone += got;
        if (got < per) p.sock.send({ t: "err", text: got ? `Your pack is full — only ${got} stone went in. Empty it at the town hall.` : "Your pack is full. Empty it at the town hall or a woodshed (F there)." });
        this.all({ t: "rock", id: k.id, by: p.pid });
        this.sendPack(p); this.dirty = true;
        return;
      }
      // on the Earth, where you'd like to begin: anywhere on dry land, before you've a homestead of your own — the nearest
      // good spot to where you pointed on the map, out of anyone else's ground
      case "spawnAt": {
        if (p.dead || this.land.kind !== "earth") return;
        if (Object.values(this.buildings).some(b => b.type === "hearth" && b.owner === p.pid)) return p.sock.send({ t: "err", text: "You've a homestead already: you begin there." });
        const x = Math.max(-this.half + 20, Math.min(this.half - 20, num(m.x))), z = Math.max(-this.half + 20, Math.min(this.half - 20, num(m.z)));
        let at = null;
        for (let r = 0; r <= 240 && !at; r += 20) for (let k = 0; k < 16 && !at; k++) {
          const a = k / 16 * Math.PI * 2, px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r, h = this.land.heightAt(px, pz);
          if (h > 1.8 && h < 60 && this.land.slopeAt(px, pz) < 0.35 && !this.claimAt(px, pz)) at = { x: px, z: pz };
        }
        if (!at) return p.sock.send({ t: "err", text: "There's no dry land to stand on near there. Pick somewhere else." });
        p.x = at.x; p.z = at.z; p.y = this.land.heightAt(at.x, at.z);
        p.sock.send({ t: "spawn", pid: p.pid, x: at.x, z: at.z, hp: p.hp });
        return;
      }
      // into a boat: at the helm if nobody is, or aboard a ship as one of its crew
      case "board": {
        const o = this.boats[String(m.id || "")]; if (!o || p.dead) return;
        if (!this.near(p, o.x, o.z, o.kind === "ship" ? 16 : 6.5)) return;   // (a little more than the reach the game offers it at: where you are reaches the server a moment late)
        const B = R.BOATS[o.kind];
        for (const b of Object.values(this.boats)) { if (b.driver === p.pid) b.driver = null; b.riders = (b.riders || []).filter(q => q !== p.pid); }
        if (!o.driver) o.driver = p.pid;
        else if ((o.riders || []).length < B.seats - 1) (o.riders ||= []).push(p.pid);
        else return p.sock.send({ t: "err", text: o.kind === "ship" ? "The ship's full." : "There's someone in it already." });
        this.all({ t: "boat", o }); return;
      }
      case "unboard": {
        for (const o of Object.values(this.boats)) {
          if (o.driver === p.pid) { o.driver = (o.riders || []).shift() || null; this.all({ t: "boat", o }); }
          else if ((o.riders || []).includes(p.pid)) { o.riders = o.riders.filter(q => q !== p.pid); this.all({ t: "boat", o }); }
        }
        return;
      }
      // the one at the helm, rowing or sailing it: where it is now (no faster than it can go, and not on dry land)
      // a rowboat swamped out on the open sea: gone to the bottom, and whoever was in her in the water
      case "boatsink": {
        const o = this.boats[String(m.id || "")]; if (!o || o.kind !== "rowboat" || o.driver !== p.pid) return;
        delete this.boats[o.id]; this.all({ t: "boatx", id: o.id }); this.dirty = true;
        this.note(`${p.name}'s rowboat was swamped in the heavy seas and went down.`, p);
        return;
      }
      case "boatmv": {
        const o = this.boats[String(m.id || "")]; if (!o || o.driver !== p.pid) return;
        const x = num(m.x, o.x), z = num(m.z, o.z), B = R.BOATS[o.kind];
        if (Math.hypot(x - o.x, z - o.z) > B.speed * 2.5 + 3) return;
        if (this.land.heightAt(x, z) > 0.2) return;
        o.x = x; o.z = z; o.yaw = num(m.yaw, o.yaw); o.moved = true; this.dirty = true;
        return;
      }
      // a ship off the slipway: built at your (or your colony's) shipyard, from the store
      case "ship": {
        const sy = this.buildings[String(m.id || "")]; if (!sy || sy.type !== "shipyard" || p.dead) return;
        if (!this.mineB(this.mode === "coop" ? "colony" : p.pid, sy) || !this.near(p, sy.x, sy.z, 22)) return;
        const no = text => p.sock.send({ t: "err", text });
        if (Object.values(this.boats).some(b => b.kind === "ship" && b.from === sy.id && Math.hypot(b.x - sy.x, b.z - sy.z) < 40)) return no("There's a ship at the slipway already. Sail her off first.");
        if (st.wood < R.SHIP.wood || st.stone < R.SHIP.stone) return no(`A ship takes ${R.SHIP.wood} logs and ${R.SHIP.stone} stone from the store.`);
        const d = R.BUILD.shipyard; let at = null;
        for (let k = 8; k <= 40 && !at; k += 2) { const x = sy.x + Math.sin(sy.ry || 0) * (d.d / 2 + k), z = sy.z + Math.cos(sy.ry || 0) * (d.d / 2 + k); if (this.land.heightAt(x, z) < -2) at = { x, z }; }
        if (!at) return no("The water off the slipway isn't deep enough for a ship.");
        st.wood -= R.SHIP.wood; st.stone -= R.SHIP.stone;
        const o = { id: "o" + (this.nextO++), kind: "ship", x: +at.x.toFixed(2), z: +at.z.toFixed(2), yaw: sy.ry || 0, owner: p.pid, from: sy.id, driver: null, riders: [] };
        this.boats[o.id] = o; this.all({ t: "boat", o }); this.stock(p); this.dirty = true;
        this.note(`${p.name} has launched a ship.`);
        return;
      }
      // an arrow (or a ball) in a beast: told by whoever loosed it; the beast's fear or its fury, and its death
      case "hunthit": {
        const a = this.beasts[String(m.id || "")]; if (!a || a.dead || p.dead) return;
        if (Math.hypot(a.x - p.x, a.z - p.z) > 120) return;
        const S = F.SPECIES[a.kind];
        a.hp -= num(m.power, 0.5) > 0.7 ? 2 : 1; if (m.head) a.hp -= 1;
        if (a.hp <= 0) { a.dead = true; a.deadAt = now(); a.st = "dead"; a.spd = 0; this.sendBeasts(true); return; }
        if (S.fierce) { a.st = "charge"; a.prey = p.pid; a.until = now() + 7000; }
        else this.scare(a, p.x, p.z, 1.4);
        return;
      }
      // a beast brought down, dressed where it lies: its meat into your pack, food for the store
      case "dress": {
        const a = this.beasts[String(m.id || "")]; if (!a || !a.dead || p.dead) return;
        const S = F.SPECIES[a.kind]; if (!this.near(p, a.x, a.z, 3.5 + S.r * 2)) return;
        const pk = this.packOf(p.pid), n = Math.min(S.meat, this.packRoom(p.pid));
        delete this.beasts[a.id]; this.sendBeasts(true);
        if (n <= 0) return p.sock.send({ t: "err", text: "Your pack is full — the meat's left for the crows. Empty your pack at the town hall." });
        pk.meat += n; this.sendPack(p); this.dirty = true;
        p.sock.send({ t: "note", text: `The ${S.name} dressed: ${n} meat in your pack${n < S.meat ? " (all it would hold)" : ""} — roast it at the town hall's fire.` });
        return;
      }
      // a fish caught: only at the water's edge, and not quicker than a cast can be made — into the pack, food for the store
      case "fish": {
        if (p.dead || t - (p.lastFish || 0) < 4000) return; p.lastFish = t;
        let wet = false;
        for (let r = 1.5; r <= 9 && !wet; r += 1.5) for (let a = 0; a < 6.28 && !wet; a += 0.5) if (this.land.heightAt(p.x + Math.cos(a) * r, p.z + Math.sin(a) * r) < -0.3) wet = true;
        if (!wet) return;
        const pk = this.packOf(p.pid), n = Math.min(2, this.packRoom(p.pid)); if (n <= 0) return;
        pk.food += n; this.sendPack(p); this.dirty = true;
        return;
      }
      case "build": {
        if (p.dead) return;
        const d = R.BUILD[m.type]; if (!d) return;
        const x = num(m.x), z = num(m.z), ry = num(m.ry);
        const no = text => p.sock.send({ t: "err", text });
        // (the first town hall: from the store and from the logs in your arms — before it stands there's nowhere else to put them)
        const armsOf = () => (this.recs[p.pid] && this.recs[p.pid].carry) | 0;
        if (m.type === "hearth" && (st.wood + armsOf() < d.wood || st.stone + (this.packOf(p.pid).stone | 0) < d.stone)) return no(`A town hall takes ${d.wood} logs — from the store, or carried to where it's to stand.`);
        if (!this.near(p, x, z, 16)) return no("Too far away to build there.");
        if (Math.abs(x) > this.half - 10 || Math.abs(z) > this.half - 10) return no("That's the edge of the map.");
        // (a boat on the water, near enough the shore to step into; a shipyard at the water's edge, its front to the water)
        if (d.boat) {
          if (this.land.heightAt(x, z) > -0.4) return no("A boat goes on the water — lay it a little way out from the shore.");
          if (!this.near(p, x, z, 12)) return no("Lay it nearer you, by the shore.");
          if (st.wood < d.wood) return no(`A rowboat takes ${d.wood} logs from the store.`);
          st.wood -= d.wood;
          const o = { id: "o" + (this.nextO++), kind: "rowboat", x: +x.toFixed(2), z: +z.toFixed(2), yaw: ry, owner: p.pid, driver: null, riders: [] };
          this.boats[o.id] = o; this.all({ t: "boat", o }); this.stock(p); this.dirty = true;
          return;
        }
        if (this.land.heightAt(x, z) < 0.6) return no("Not in the water.");
        if (d.shore) { const fx = x + Math.sin(ry) * (d.d / 2 + 6), fz = z + Math.cos(ry) * (d.d / 2 + 6); if (this.land.heightAt(fx, fz) > -1.2) return no("A shipyard stands at the water's edge, its front (the slipway) out over deep water. Turn it (R) to face the water."); }
        if (m.type === "hearth" && this.natOf(p.pid) && this.natOf(p.pid) !== p.pid) return no(`You're one of the people of ${this.nations[this.natOf(p.pid)].name} — its town hall is yours. Leave the nation (G) to found your own.`);
        if (m.type === "hearth" && Object.values(this.buildings).some(b => b.type === "hearth" && (b.owner === p.pid || this.mode === "coop"))) return no(this.mode === "coop" ? "The colony has its town hall already." : "You have a town hall already. Break it to move your homestead.");
        const claim = this.claimAt(x, z);
        if (claim && !this.allied(claim.owner, p.pid)) return no(`That's ${this.recs[claim.owner] ? this.recs[claim.owner].name + "'s" : "someone's"} ground.`);
        if (m.type === "hearth") for (const b of Object.values(this.buildings)) if (b.type === "hearth" && !this.allied(b.owner, p.pid) && Math.hypot(b.x - x, b.z - z) < d.claim + R.claimOf(b)) return no("Too near someone else's homestead.");
        for (const b of Object.values(this.buildings)) {
          const e = R.BUILD[b.type], gap = (d.wall && e.wall) ? 1.2 : (d.wall ? 0.3 : d.r) + (e.wall ? 0.3 : e.r) - 0.2;
          if (Math.hypot(b.x - x, b.z - z) < gap) return no("Something's in the way.");
        }
        for (const q of Object.values(this.sites)) { const e = R.BUILD[q.type]; if (Math.hypot(q.x - x, q.z - z) < (d.wall ? 0.3 : d.r) + (e.wall ? 0.3 : e.r) - 0.2) return no("There's a site laid out there already."); }
        // the town hall: lit at once, from what's in the store (it's where everything else is kept)
        if (m.type === "hearth") {
          { const rec = this.recs[p.pid], fromArms = Math.min(armsOf(), d.wood); if (fromArms) { rec.carry -= fromArms; p.sock.send({ t: "carry", n: rec.carry }); } st.wood -= d.wood - fromArms; }
          { const pk = this.packOf(p.pid), fs = Math.min(st.stone, d.stone); st.stone -= fs; pk.stone -= d.stone - fs; if (d.stone > fs) this.sendPack(p); }
          const b = { id: "b" + (this.nextB++), type: m.type, x, z, ry, owner: p.pid, hp: d.hp, at: t };
          this.buildings[b.id] = b; this.all({ t: "b", b }); this.stock(p); this.dirty = true;
          this.crown(p);
          return;
        }
        // anything else: a site, as in the settlement — its logs to be brought, then raised
        const sx = { id: "s" + (this.nextB++), type: m.type, x, z, ry, owner: p.pid, logs: 0 };
        this.sites[sx.id] = sx; this.all({ t: "site", s: sx }); this.dirty = true;
        return;
      }
      // a settler put to work at a field (or let go from it, back to whatever's wanted)
      case "take": {
        const pl = this.piles[String(m.id || "")], rec = this.recs[p.pid]; if (!pl || !rec || p.dead) return;
        if (!this.near(p, pl.x, pl.z, 3.6)) return;
        const room = CARRY_MAX - (rec.carry || 0); if (room <= 0) return p.sock.send({ t: "err", text: `${CARRY_MAX} is all anyone can carry. Stack them at the town hall or a woodshed, or take them to a site.` });
        const n = Math.min(room, pl.n); pl.n -= n; rec.carry = (rec.carry || 0) + n;
        if (pl.n <= 0) { delete this.piles[pl.id]; this.all({ t: "pilex", id: pl.id }); } else this.all({ t: "pile", p: pl });
        p.sock.send({ t: "carry", n: rec.carry }); this.dirty = true;
        return;
      }
      case "stack": case "unstack": {
        const rec = this.recs[p.pid], b = this.buildings[String(m.id || "")]; if (!rec || !b || p.dead) return;
        if (!(b.type === "hearth" || b.type === "shed") || !this.mineB(this.mode === "coop" ? "colony" : p.pid, b) || !this.near(p, b.x, b.z, R.BUILD[b.type].r + 3.5)) return;
        if (m.t === "stack") {
          const pk = this.packOf(p.pid);
          if (!rec.carry && !pk.stone && !pk.food && !pk.meat && !pk.roast) return;
          st.wood += rec.carry || 0; rec.carry = 0;
          st.stone += pk.stone | 0; st.food = (st.food | 0) + (pk.food | 0) + (pk.meat | 0) + (pk.roast | 0) * 2; pk.stone = 0; pk.food = 0; pk.meat = 0; pk.roast = 0;
          this.sendPack(p);
        }
        else { const n = Math.min(CARRY_MAX - (rec.carry || 0), st.wood); if (n <= 0) return; st.wood -= n; rec.carry = (rec.carry || 0) + n; }
        p.sock.send({ t: "carry", n: rec.carry }); this.stock(p); this.dirty = true;
        return;
      }
      // the store, item by item, as a chest is (at the town hall or a woodshed of your own, or the colony's): one kind of
      // thing put in, or taken out
      case "storeput": case "storetake": {
        const rec = this.recs[p.pid], b = this.buildings[String(m.id || "")]; if (!rec || !b || p.dead) return;
        if (!(b.type === "hearth" || b.type === "shed") || !this.mineB(this.mode === "coop" ? "colony" : p.pid, b) || !this.near(p, b.x, b.z, R.BUILD[b.type].r + 4)) return;
        const st = this.storeOf(p.pid), pk = this.packOf(p.pid), k = String(m.k || ""), want = Math.max(1, Math.min(99, num(m.n, 99) | 0));
        if (m.t === "storeput") {
          if (k === "wood") { const n = rec.carry || 0; if (!n) return; st.wood += n; rec.carry = 0; }
          else if (k === "stone") { const n = Math.min(want, pk.stone | 0); if (!n) return; pk.stone -= n; st.stone += n; }
          else if (k === "food" || k === "meat" || k === "roast") { const n = Math.min(want, pk[k] | 0); if (!n) return; pk[k] -= n; st.food = (st.food | 0) + n * (k === "roast" ? 2 : 1); }
          else return;
        } else {
          if (k === "wood") { const n = Math.min(CARRY_MAX - (rec.carry || 0), st.wood); if (n <= 0) return p.sock.send({ t: "err", text: rec.carry >= CARRY_MAX ? "Your arms are full." : "There are no logs in the store." }); st.wood -= n; rec.carry = (rec.carry || 0) + n; }
          else if (k === "stone") { const n = Math.min(want, st.stone, this.packRoom(p.pid)); if (n <= 0) return p.sock.send({ t: "err", text: "Your pack is full." }); st.stone -= n; pk.stone += n; }
          // (the store's food comes out as provisions, ready to eat: two of it for a roast)
          else if (k === "food") { const n = Math.min(want, Math.floor((st.food | 0) / 2), this.packRoom(p.pid)); if (n <= 0) return p.sock.send({ t: "err", text: (st.food | 0) < 2 ? "There isn't enough food in the store." : "Your pack is full." }); st.food -= n * 2; pk.roast += n; }
          else return;
        }
        p.sock.send({ t: "carry", n: rec.carry || 0 }); this.sendPack(p); this.stock(p); this.dirty = true;
        return;
      }
      // the town hall rebuilt grander: from the store, a level at a time
      case "hallup": {
        const b = this.buildings[String(m.id || "")]; if (!b || p.dead || b.type !== "hearth") return;
        if (!this.mineB(this.mode === "coop" ? "colony" : p.pid, b) || (this.mode === "coop" && this.hostPid && p.pid !== this.hostPid)) return;
        const nx = R.HALL[(b.level || 1) + 1], st = this.storeOf(p.pid); if (!nx) return;
        if (st.wood < nx.wood || st.stone < nx.stone) return p.sock.send({ t: "err", text: `That takes ${nx.wood} logs and ${nx.stone} stone in the store.` });
        st.wood -= nx.wood; st.stone -= nx.stone; b.level = (b.level || 1) + 1; b.hp = (R.BUILD.hearth.hp + (b.level - 1) * 200);
        this.all({ t: "bup", b, by: p.pid }); this.stock(p); this.dirty = true;
        this.note(`${p.name} has rebuilt their town hall as ${nx.name}.`);
        return;
      }
      // roasting at the town hall's fire: all the raw fish and meat you carry, cooked
      case "cook": {
        const b = this.buildings[String(m.id || "")], pk = this.packOf(p.pid); if (!b || p.dead || b.type !== "hearth" || !this.near(p, b.x, b.z, R.BUILD.hearth.r + 6)) return;
        const n = (pk.food | 0) + (pk.meat | 0); if (!n) return;
        pk.food = 0; pk.meat = 0; pk.roast += n; this.sendPack(p); this.dirty = true;
        return;
      }
      // something eaten from your pack: cooked food mends you, raw a little (and the fever's on you, not the server)
      case "eat": {
        const pk = this.packOf(p.pid), k = String(m.k || ""); if (p.dead || !["roast", "food", "meat"].includes(k) || !(pk[k] > 0) || t - (p.lastEat || 0) < 1500) return;
        p.lastEat = t; pk[k]--; p.hp = Math.min(R.MAX_HP, p.hp + R.MAX_HP * (k === "roast" ? 0.2 : 0.05));
        this.all({ t: "hp", pid: p.pid, hp: p.hp }); this.sendPack(p); this.dirty = true;
        return;
      }
      // going hungry: it wears you down, slowly, till you eat
      // ---- the nation: invitations, answers, roles, leaving, its name ----
      case "natinvite": {
        const n = this.natOf(p.pid), role = this.roleOf(p.pid), want = m.role === "governor" ? "governor" : "citizen", q = this.online.get(String(m.pid || ""));
        const no = text => p.sock.send({ t: "err", text });
        if (!n) return no("You have no nation to invite anyone into. Raise a town hall, and you'll be crowned.");
        if (role !== "monarch" && !(role === "governor" && want === "citizen")) return no(role === "governor" ? "A governor can invite citizens; only the crown makes governors." : "Only the crown and its governors can invite people in.");
        if (!q || q.pid === p.pid) return;
        if (this.natOf(q.pid) === n) return no(`${q.name} is one of your people already.`);
        if (this.nations[q.pid]) return no(`${q.name} wears a crown of their own.`);
        this.natAsk.set(q.pid + ">" + n, { role: want, at: now(), by: p.pid });
        q.sock.send({ t: "natask", nation: n, name: this.nations[n].name, title: this.nations[n].title, monarch: (this.recs[n] || {}).name || "", from: p.name, role: want });
        return p.sock.send({ t: "note", text: `You've asked ${q.name} to join ${this.nations[n].name} as ${want === "governor" ? "a governor" : "a citizen"}.` });
      }
      case "natyes": case "natno": {
        const n = String(m.nation || ""), k = p.pid + ">" + n, ask = this.natAsk.get(k); if (!ask || !this.nations[n]) return;
        this.natAsk.delete(k);
        const by = this.online.get(ask.by);
        if (m.t === "natno") { if (by) by.sock.send({ t: "note", text: `${p.name} would rather not join.` }); return; }
        if (this.nations[p.pid]) return p.sock.send({ t: "err", text: "You wear a crown of your own." });
        const old = this.natOf(p.pid); if (old) this.natLeave(p.pid);
        this.nations[n].members[p.pid] = ask.role; this.recs[p.pid].nation = n;
        this.headline("nation", `${p.name} has joined ${this.nations[n].name} as ${ask.role === "governor" ? "a governor" : "a citizen"}.`);
        this.natSend(); this.stock(p);
        return;
      }
      case "natrole": {
        const n = this.natOf(p.pid); if (!n || n !== p.pid) return p.sock.send({ t: "err", text: "Only the crown names its governors." });
        const pid = String(m.pid || ""), role = m.role === "governor" ? "governor" : "citizen";
        if (!this.nations[n].members[pid] || pid === n) return;
        this.nations[n].members[pid] = role; this.natSend();
        const q = this.online.get(pid); if (q) q.sock.send({ t: "note", text: role === "governor" ? `The ${this.nations[n].title.toLowerCase()} has made you a governor of ${this.nations[n].name}.` : `You're a citizen of ${this.nations[n].name} now, no longer a governor.` });
        return;
      }
      case "natdismiss": {
        const n = this.natOf(p.pid), pid = String(m.pid || ""), r = this.roleOf(p.pid); if (!n || pid === n || !this.nations[n].members[pid]) return;
        if (!(r === "monarch" || (r === "governor" && this.nations[n].members[pid] === "citizen"))) return p.sock.send({ t: "err", text: "You can't send them away." });
        this.natLeave(pid); this.natSend();
        const q = this.online.get(pid); if (q) q.sock.send({ t: "note", text: `You've been sent away from ${this.nations[n].name}.` });
        return;
      }
      case "natleave": { const n = this.natOf(p.pid); if (!n || n === p.pid) return; const nm = this.nations[n].name; this.natLeave(p.pid); this.natSend(); this.note(`${p.name} has left ${nm}.`); return; }
      case "natname": {
        const n = this.natOf(p.pid); if (!n || n !== p.pid) return;
        const N = this.nations[n], name = clean(m.name, 36), TITLES = ["King", "Queen", "Prince", "Princess", "Duke", "Duchess", "Lord", "Lady", "Elector", "Margrave"];
        const was = N.name;
        if (name) N.name = name; if (TITLES.includes(m.title)) N.title = m.title;
        if (name && name !== was) this.headline("nation", `${was} is now called ${N.name}.`);
        this.natSend(); return;
      }
      // the cold, or the heat, has you: as hunger does, a little at a time
      case "exposure": {
        if (p.dead || t - (p.lastExposure || 0) < 5500) return; p.lastExposure = t;
        p.hp = Math.max(0, p.hp - R.MAX_HP * 0.03);
        if (p.hp <= 0) { p.hp = 1; this.damage(p, 1, null, p.x, p.z); } else this.all({ t: "hp", pid: p.pid, hp: p.hp });
        return;
      }
      case "starve": {
        if (p.dead || t - (p.lastStarve || 0) < 5500) return; p.lastStarve = t;
        p.hp = Math.max(0, p.hp - R.MAX_HP * 0.025);
        if (p.hp <= 0) { p.hp = 1; this.damage(p, 1, null, p.x, p.z); } else this.all({ t: "hp", pid: p.pid, hp: p.hp });
        return;
      }
      case "deliver": {
        const rec = this.recs[p.pid], sx = this.sites[String(m.id || "")]; if (!rec || !sx || !rec.carry || p.dead) return;
        const d = R.BUILD[sx.type];
        if (!(sx.owner === p.pid || this.mode === "coop" || this.allied(sx.owner, p.pid)) || !this.near(p, sx.x, sx.z, (d.wall ? d.len / 2 : d.r) + 3.5)) return;
        const n = Math.min(rec.carry, d.wood - sx.logs); if (n <= 0) return;
        sx.logs += n; rec.carry -= n;
        p.sock.send({ t: "carry", n: rec.carry }); this.all({ t: "site", s: sx }); this.dirty = true;
        return;
      }
      case "raise": {
        const sx = this.sites[String(m.id || "")]; if (!sx || p.dead) return;
        const d = R.BUILD[sx.type], no = text => p.sock.send({ t: "err", text });
        if (!(sx.owner === p.pid || this.mode === "coop" || this.allied(sx.owner, p.pid)) || !this.near(p, sx.x, sx.z, (d.wall ? d.len / 2 : d.r) + 3.5)) return;
        if (sx.logs < d.wood) return no(`It wants ${d.wood - sx.logs} more logs first.`);
        const ost = this.storeFor(this.mode === "coop" ? "colony" : sx.owner) || st;
        // (the stone from the stores first, then from your pack, as in the settlement)
        const pk = this.packOf(p.pid), have = (ost.stone || 0) + (pk.stone | 0);
        if (have < d.stone) return no(`It wants ${d.stone} stone, from the store and your pack — ${d.stone - have} short. Break the grey rocks.`);
        const fromStore = Math.min(ost.stone || 0, d.stone); ost.stone -= fromStore; pk.stone -= d.stone - fromStore;
        if (d.stone - fromStore > 0) this.sendPack(p);
        delete this.sites[sx.id]; this.all({ t: "sitex", id: sx.id });
        const b = { id: "b" + (this.nextB++), type: sx.type, x: sx.x, z: sx.z, ry: sx.ry, owner: sx.owner, hp: d.hp, at: t };
        this.buildings[b.id] = b; this.all({ t: "b", b }); this.stockTo(this.mode === "coop" ? "colony" : sx.owner); this.dirty = true;
        return;
      }
      case "unsite": {
        const sx = this.sites[String(m.id || "")]; if (!sx) return;
        if (!(sx.owner === p.pid || (this.mode === "coop" && this.manages(p)))) return;
        delete this.sites[sx.id]; this.all({ t: "sitex", id: sx.id });
        if (sx.logs) this.addPile(sx.x + 1.5, sx.z, 0, sx.logs);
        this.dirty = true;
        return;
      }
      case "assign": {
        const v = this.settlers[String(m.sid || "")], f = m.field ? this.buildings[String(m.field)] : null;
        const no = text => p.sock.send({ t: "err", text });
        if (!v) return;
        if (!this.manages(p)) return no(`It's ${this.host || "the host"}'s settlement: they say who works where.`);
        if (this.mode !== "coop" && v.owner !== p.pid) return no("That's not one of your people.");
        if (f && (f.type !== "field" || !this.mineB(v.owner, f))) return;
        if (f) { v.pin = { job: "farm", field: f.id }; if (v.job !== "farm") { v.job = "farm"; v.state = "find"; v.target = null; this.all({ t: "sjob", id: v.id, job: "farm" }); } }
        else v.pin = null;
        this.all({ t: "spin", id: v.id, field: f ? f.id : null });
        p.sock.send({ t: "note", text: f ? `${v.name} will work that field.` : `${v.name} goes back to whatever's wanted.` });
        this.dirty = true;
        return;
      }
      case "hitb": {
        if (p.dead || t - p.lastBlow < 300) return; p.lastBlow = t;
        const b = this.buildings[m.id]; if (!b) return;
        const d = R.BUILD[b.type];
        if (!this.near(p, b.x, b.z, (d.wall ? d.len / 2 : d.r) + R.REACH + 1)) return;
        const no = text => p.sock.send({ t: "err", text });
        // your own: taken down, and most of it back (in co-op, whoever put it up, or the host)
        if (b.owner === p.pid || (this.mode === "coop" && this.manages(p))) {
          delete this.buildings[b.id];
          st.wood += Math.floor(d.wood * 0.6); st.stone += Math.floor(d.stone * 0.6);
          this.all({ t: "bx", id: b.id, by: p.pid, own: true }); this.stock(p); this.dirty = true; return;
        }
        if (this.mode === "coop") return no("Not in a game among friends.");
        if (this.allied(b.owner, p.pid)) return no("That's your ally's.");
        // the owner away: their homestead is safe until they're back
        if (!this.online.has(b.owner)) return no(`${this.recs[b.owner] ? this.recs[b.owner].name : "Its owner"} is away — nothing of theirs can be broken while they're gone.`);
        b.hp -= R.BLOW.building * (this.hasForge(p.pid) ? 1.5 : 1);
        if (b.hp > 0) { this.all({ t: "bhp", id: b.id, hp: b.hp, by: p.pid }); this.dirty = true; return; }
        delete this.buildings[b.id];
        const vict = this.recs[b.owner], got = { wood: Math.floor(d.wood * 0.3), stone: Math.floor(d.stone * 0.3) };
        if (d.store && vict) { const w = Math.floor(vict.wood / 2), s = Math.floor(vict.stone / 2); vict.wood -= w; vict.stone -= s; got.wood += w; got.stone += s; const o = this.online.get(b.owner); if (o) this.stock(o); }
        st.wood += got.wood; st.stone += got.stone;
        this.all({ t: "bx", id: b.id, by: p.pid, got });
        this.stock(p); this.dirty = true;
        return;
      }
      case "hit": {
        if (p.dead || t - p.lastHit < 380) return; p.lastHit = t;
        const q = this.online.get(String(m.pid || "")); if (!q || q.dead || Math.abs((q.y || 0) - (p.y || 0)) > 8) return;
        if (this.mode === "coop") return;
        if (this.allied(p.pid, q.pid)) return;
        if (!this.near(p, q.x, q.z, R.REACH + 0.8)) return;
        if (q.shield > t) return p.sock.send({ t: "err", text: `${q.name} has only just come — leave them be a moment.` });
        // a hit that strikes into a raised guard, from in front, mostly glances off
        let dmg = R.BLOW.player * (this.hasForge(p.pid) ? 1.25 : 1);
        p.shield = 0;                 // (striking someone ends your own grace)
        this.damage(q, dmg, p.pid, p.x, p.z);
        return;
      }
      case "hits": {              // a blow at someone's settler
        if (p.dead || t - p.lastHit < 380) return; p.lastHit = t;
        const sv = this.settlers[String(m.id || "")]; if (!sv) return;
        if (this.mode === "coop" || this.allied(sv.owner, p.pid)) return;
        if (!this.active(sv.owner)) return p.sock.send({ t: "err", text: "Their people are safe while they're away." });
        if (!this.near(p, sv.x, sv.z, R.REACH + 0.8)) return;
        sv.hp -= R.BLOW.player * (this.hasForge(p.pid) ? 1.25 : 1);
        sv.hurtAt = t;
        if (sv.hp > 0) { this.all({ t: "sh", id: sv.id, hp: sv.hp, by: p.pid }); if (sv.job !== "watch") { sv.state = "flee"; sv.from = { x: p.x, z: p.z }; sv.until = t + 6000; } return; }
        delete this.settlers[sv.id];
        this.all({ t: "sx", id: sv.id, by: p.pid, dead: true });
        const o = this.online.get(sv.owner); if (o) o.sock.send({ t: "note", text: `${sv.name} was killed by ${p.name}.` });
        this.dirty = true;
        return;
      }
      case "war": {               // a claim war declared on someone's homestead
        if (this.mode !== "pvp") return;
        const q = this.online.get(String(m.pid || "")); const no = text => p.sock.send({ t: "err", text });
        if (!q || q === p) return;
        if (this.allied(p.pid, q.pid)) return no("You can't make war on an ally. Leave the alliance first.");
        const hearth = Object.values(this.buildings).find(b => b.type === "hearth" && b.owner === q.pid);
        if (!hearth) return no(`${q.name} has no homestead to take.`);
        if (!Object.values(this.buildings).some(b => b.type === "hearth" && b.owner === p.pid)) return no("You need a homestead of your own before you can claim another's.");
        if (this.wars.some(w => w.att === p.pid || w.def === q.pid)) return no("There's a war on already — one at a time.");
        if (t - (this.lastWar[q.pid] || 0) < R.WAR.cooldownMs) return no(`${q.name}'s homestead was fought over only lately. Give them a while.`);
        const war = { id: "w" + crypto.randomBytes(3).toString("hex"), att: p.pid, def: q.pid, attName: p.name, defName: q.name, hearth: hearth.id, x: hearth.x, z: hearth.z, start: t, progress: 0 };
        this.wars.push(war);
        this.all({ t: "wars", wars: this.wars });
        this.headline("war", `${p.name} has declared a claim war on ${q.name}'s homestead!`);
        q.sock.send({ t: "warned", war });
        return;
      }
      case "chat": {
        const text = clean(m.text, 200); if (!text) return;
        if (t - (p.lastChat || 0) < 500) return; p.lastChat = t;
        const c = { pid: p.pid, name: p.name, text, at: t, to: m.allies ? "allies" : "all" };
        if (m.allies) { for (const q of this.online.values()) if (this.allied(p.pid, q.pid) || q === p) q.sock.send({ t: "chat", ...c }); return; }
        this.chat.push(c); if (this.chat.length > 60) this.chat.shift();
        this.all({ t: "chat", ...c });
        return;
      }
      case "ally": {              // asking someone to be your ally
        if (this.mode === "coop") return;
        const q = this.online.get(String(m.pid || "")); if (!q || q === p || this.allied(p.pid, q.pid)) return;
        const g = rec.group && this.groups[rec.group];
        if (g && g.members.length >= R.GROUP_MAX) return p.sock.send({ t: "err", text: "Your alliance is as big as it can be." });
        this.invites.set(q.pid + ">" + p.pid, t);
        q.sock.send({ t: "invite", pid: p.pid, name: p.name, group: g ? g.name : null });
        p.sock.send({ t: "note", text: `You've asked ${q.name} to stand with you.` });
        return;
      }
      case "allyok": {            // saying yes
        const q = this.online.get(String(m.pid || "")); if (!q) return;
        const k = p.pid + ">" + q.pid, at = this.invites.get(k);
        if (!at || t - at > 120000) return p.sock.send({ t: "err", text: "That offer has lapsed." });
        this.invites.delete(k);
        const qr = this.recs[q.pid];
        if (rec.group) this.quitGroup(p.pid);
        let gid = qr.group;
        if (!gid || !this.groups[gid]) { gid = "g" + crypto.randomBytes(3).toString("hex"); this.groups[gid] = { name: clean(m.name, 30) || `${q.name}'s alliance`, members: [q.pid] }; qr.group = gid; }
        if (this.groups[gid].members.length >= R.GROUP_MAX) return p.sock.send({ t: "err", text: "Their alliance is full." });
        this.groups[gid].members.push(p.pid); rec.group = gid;
        this.all({ t: "groups", groups: this.groups });
        this.note(`${p.name} and ${q.name} are allies now.`);
        this.headline("ally", `${p.name} and ${q.name} have made an alliance.`);
        this.dirty = true;
        return;
      }
      case "allyno": { const q = this.online.get(String(m.pid || "")); this.invites.delete(p.pid + ">" + (q && q.pid)); if (q) q.sock.send({ t: "note", text: `${p.name} would rather not.` }); return; }
      case "unally": { if (rec.group) { const g = this.groups[rec.group]; this.quitGroup(p.pid); this.all({ t: "groups", groups: this.groups }); this.note(`${p.name} has left ${g && !g.name.startsWith(p.name) ? g.name : "the alliance"}.`); this.dirty = true; } return; }
      case "give": {             // logs or stone handed to someone near
        const q = this.online.get(String(m.pid || "")); if (!q || q === p || !this.near(p, q.x, q.z, 6)) return;
        // (from your arms and your pack, into theirs, as much as they can take)
        const pk = this.packOf(p.pid), qk = this.packOf(q.pid), qr = this.recs[q.pid];
        const w = Math.max(0, Math.min(rec.carry || 0, num(m.wood) | 0, CARRY_MAX - (qr.carry || 0))), s = Math.max(0, Math.min(pk.stone | 0, num(m.stone) | 0, this.packRoom(q.pid)));
        if (!w && !s) return;
        rec.carry -= w; qr.carry = (qr.carry || 0) + w; pk.stone -= s; qk.stone += s;
        p.sock.send({ t: "carry", n: rec.carry }); q.sock.send({ t: "carry", n: qr.carry }); this.sendPack(p); this.sendPack(q);
        q.sock.send({ t: "note", text: `${p.name} gave you ${[w && `${w} logs`, s && `${s} stone`].filter(Boolean).join(" and ")}.` });
        this.dirty = true;
        return;
      }
      case "trade": {            // at a market of your own or an ally's: four logs for a stone, or a stone for three logs
        const mk = Object.values(this.buildings).find(b => b.type === "market" && this.allied(b.owner, p.pid) && this.near(p, b.x, b.z, 9));
        if (!mk) return;
        if (m.want === "stone" && st.wood >= 4) { st.wood -= 4; st.stone += 1; }
        else if (m.want === "wood" && st.stone >= 1) { st.stone -= 1; st.wood += 3; }
        this.stock(p); this.dirty = true;
        return;
      }
      case "respawn": return;
      // a fallen player's sack, taken up
      case "loot": {
        const d = this.drops[String(m.id || "")]; if (!d || p.dead || !this.near(p, d.x, d.z, 3.6)) return;
        // (into your arms and your pack, as much as goes; the rest stays in the sack)
        const pk = this.packOf(p.pid), arms = Math.min(d.wood, CARRY_MAX - (rec.carry || 0));
        rec.carry = (rec.carry || 0) + arms; d.wood -= arms;
        const sg = Math.min(d.stone, this.packRoom(p.pid)); pk.stone += sg; d.stone -= sg;
        const fg = Math.min(d.food || 0, this.packRoom(p.pid)); pk.food += fg; d.food = (d.food || 0) - fg;
        p.sock.send({ t: "carry", n: rec.carry }); this.sendPack(p);
        if (d.wood + d.stone + (d.food || 0) > 0) { this.all({ t: "drop", d }); p.sock.send({ t: "err", text: "You can't carry it all — the rest is still in the sack." }); this.dirty = true; return; }
        delete this.drops[d.id];
        this.all({ t: "dropgone", id: d.id, by: p.pid, name: p.name, d });
        if (p.pid !== d.owner) this.note(`${p.name} has looted ${d.name}'s sack.`);
        if (d.wood + d.stone >= 20 && p.pid !== d.owner) this.headline("death", `${p.name} stripped ${d.name}'s body of ${d.wood} logs and ${d.stone} stone.`);
        this.stock(p); this.dirty = true;
        return;
      }
    }
  }
  // ---- the wild beasts: never far from anyone, in their own kinds for the country, going about their own lives ----
  wild(dt) {
    const t = now(), players = [...this.online.values()].filter(q => !q.dead);
    const list = Object.values(this.beasts);
    // (gone out of everyone's way: let go of; the dead, a while after they fell)
    for (const a of list) {
      const far = players.every(q => Math.hypot(q.x - a.x, q.z - a.z) > 260);
      if ((far && !a.dead) || (a.dead && t - a.deadAt > 240000) || (far && a.dead)) delete this.beasts[a.id];
    }
    // more where there are too few: a herd at a time, out of sight, of the beasts that live there
    for (const q of players) {
      const near = Object.values(this.beasts).filter(a => !a.dead && Math.hypot(q.x - a.x, q.z - a.z) < 170).length;
      if (near >= 14 || Math.random() > 0.25) continue;
      for (let k = 0; k < 8; k++) {
        const ang = Math.random() * Math.PI * 2, d = 70 + Math.random() * 90, x = q.x + Math.cos(ang) * d, z = q.z + Math.sin(ang) * d;
        if (Math.abs(x) > this.half - 20 || Math.abs(z) > this.half - 20) continue;
        const h = this.land.heightAt(x, z); if (h < 1.2 || h > 75 || this.claimAt(x, z)) continue;
        const kinds = F.faunaAt(this.land, x, z); if (!kinds.length) break;
        const kind = F.pickFauna(kinds, Math.random()), S = F.SPECIES[kind];
        // (a beaver or a capybara only near water)
        if (S.water && ![[10, 0], [-10, 0], [0, 10], [0, -10], [7, 7], [-7, -7]].some(([dx, dz]) => this.land.heightAt(x + dx, z + dz) < 0)) continue;
        const n = 1 + Math.floor(Math.random() * (S.herd || 1));
        for (let i = 0; i < n; i++) { const id = "a" + (this.nextA++), bx = x + (Math.random() - 0.5) * 8, bz = z + (Math.random() - 0.5) * 8; this.beasts[id] = { id, kind, x: bx, z: bz, yaw: Math.random() * 6.28, spd: 0, st: "graze", hp: S.hp, until: t + Math.random() * 5000, home: { x, z } }; }
        break;
      }
    }
    // each about its business: grazing, wandering, hearing you and off, or (the fierce ones) coming for you
    for (const a of Object.values(this.beasts)) {
      if (a.dead) continue;
      const S = F.SPECIES[a.kind];
      let close = null, cd = Infinity;
      for (const q of players) { if (q.y < -60) continue; const d = Math.hypot(q.x - a.x, q.z - a.z); if (d < cd) { cd = d; close = q; } }
      if (close && a.st !== "flee" && a.st !== "charge") {
        const loud = close.s > 4 ? S.hearRun : close.s > 0.4 ? (close.c ? S.hearCreep : S.hearWalk) : 2.2;
        if (cd < loud) {
          if (S.fierce && cd < loud * 0.6 && Math.random() < 0.5) { a.st = "charge"; a.prey = close.pid; a.until = t + 7000; }
          else this.scare(a, close.x, close.z, 1);
        }
      }
      if (a.st === "charge") {
        const q = this.online.get(a.prey);
        if (!q || q.dead || t > a.until || q.y < -60) { a.st = "walk"; a.until = t + 4000; a.tx = a.home.x; a.tz = a.home.z; }
        else {
          a.yaw = Math.atan2(q.x - a.x, q.z - a.z); a.spd = S.run * 0.85;
          const d = Math.hypot(q.x - a.x, q.z - a.z);
          if (d < S.r + 1.1) { a.spd = 0; if (t - (a.bit || 0) > 1300) { a.bit = t; this.damage(q, S.fierce, a.id, a.x, a.z); } }
        }
      } else if (a.st === "flee") {
        a.spd = S.run; if (t > a.until) { a.st = "graze"; a.spd = 0; a.until = t + 3000 + Math.random() * 6000; }
      } else if (t > a.until) {
        // (grazing a while, then a little way on, never far from where it was found)
        if (a.st === "graze") { const ang = Math.random() * 6.28, r = Math.random() * 25; a.tx = a.home.x + Math.cos(ang) * r; a.tz = a.home.z + Math.sin(ang) * r; a.st = "walk"; a.until = t + 12000; }
        else { a.st = "graze"; a.spd = 0; a.until = t + 4000 + Math.random() * 9000; }
      }
      if (a.st === "walk") {
        const dx = a.tx - a.x, dz = a.tz - a.z, d = Math.hypot(dx, dz);
        if (d < 1) { a.st = "graze"; a.spd = 0; a.until = t + 4000 + Math.random() * 8000; } else { a.yaw = Math.atan2(dx, dz); a.spd = S.walk; }
      }
      if (a.spd > 0) {
        const nx = a.x + Math.sin(a.yaw) * a.spd * dt, nz = a.z + Math.cos(a.yaw) * a.spd * dt, h = this.land.heightAt(nx, nz);
        // (not into the sea or a lake, unless it's a beast of the water; not up a cliff)
        if ((h < 0.4 && !S.water) || h < -1.5 || h > 80) { a.yaw += Math.PI * (0.6 + Math.random() * 0.8); if (a.st === "walk") a.until = 0; }
        else { a.x = nx; a.z = nz; }
      }
    }
    this.sendBeasts(false);
  }
  // off, away from what frightened it, and the others of its herd with it
  scare(a, fx, fz, k) {
    const t = now(), S = F.SPECIES[a.kind];
    a.yaw = Math.atan2(a.x - fx, a.z - fz) + (Math.random() - 0.5) * 0.8; a.st = "flee"; a.until = t + (4000 + Math.random() * 3000) * k; a.spd = S.run;
    for (const o of Object.values(this.beasts)) if (o !== a && !o.dead && o.kind === a.kind && o.st !== "flee" && Math.hypot(o.x - a.x, o.z - a.z) < 18) { o.yaw = a.yaw + (Math.random() - 0.5) * 0.6; o.st = "flee"; o.until = a.until; o.spd = S.run; }
  }
  // to each player, the beasts round them: [id, kind, x, z, yaw, speed, state, head]
  sendBeasts(now_) {
    if (!now_ && (this.beastN = (this.beastN || 0) + 1) % 1) return;
    for (const q of this.online.values()) {
      const l = [];
      for (const a of Object.values(this.beasts)) if (Math.hypot(q.x - a.x, q.z - a.z) < 200) l.push([a.id, a.kind, +a.x.toFixed(2), +a.z.toFixed(2), +a.yaw.toFixed(2), +(a.spd || 0).toFixed(2), a.st, a.st === "graze" ? 0 : 1, 0]);
      q.sock.send({ t: "ax", l });
    }
  }
  // a blow landing on a player: from another player (by a pid) or a settler (by "s…")
  damage(q, dmg, by, fx, fz) {
    const t = now();
    if (q.dead || q.shield > t) return false;
    const face = Math.atan2(fx - q.x, fz - q.z), diff = Math.abs(Math.atan2(Math.sin(face - (q.yaw + Math.PI)), Math.cos(face - (q.yaw + Math.PI))));
    const guarded = q.g && diff < 1.2;
    if (guarded) dmg *= 0.25;
    q.hp = Math.max(0, q.hp - dmg); q.hurtAt = t;
    this.all({ t: "hp", pid: q.pid, hp: q.hp, by, guarded });
    if (q.hp > 0) return true;
    q.dead = true;
    const killer = this.recs[by] ? by : (this.settlers[by] && this.settlers[by].owner);
    const vr = this.storeOf(q.pid), kr = killer && killer !== "colony" ? this.storeOf(killer) : null;
    // what they carried: a third of it, dropped in a sack where they fell — the killer's, or anyone's who gets there first
    let w = 0, s = 0, f = 0, drop = null;
    {
      // (what was in their arms and their pack — not the stores at home)
      const qr = this.recs[q.pid], pk = this.packOf(q.pid);
      w = (qr && qr.carry) || 0; s = pk.stone | 0; f = pk.food | 0;
      f += (pk.meat | 0) + (pk.roast | 0);
      if (w || s || f) {
        if (qr) qr.carry = 0; pk.stone = 0; pk.food = 0; pk.meat = 0; pk.roast = 0; q.sock.send({ t: "carry", n: 0 }); this.sendPack(q);
        drop = { id: "d" + this.nextD++, x: q.x, z: q.z, wood: w, stone: s, food: f, name: q.name, owner: q.pid, at: t };
        this.drops[drop.id] = drop; this.all({ t: "drop", d: drop });
      }
    }
    void kr;
    if (this.recs[by]) this.recs[by].kills++; if (this.recs[q.pid]) this.recs[q.pid].deaths++;
    this.all({ t: "die", pid: q.pid, by, dropped: drop ? { wood: w, stone: s, food: f } : null });
    { const kn = this.online.get(by) ? this.online.get(by).name : this.settlers[by] ? `${this.settlers[by].name}, a watchman` : this.beasts && this.beasts[by] ? `a ${F.SPECIES[this.beasts[by].kind].name}` : "someone"; this.headline("death", `${q.name} was struck down by ${kn}.`); }
    const ko = killer && this.online.get(killer); if (ko) this.stock(ko); this.stock(q); this.dirty = true;
    setTimeout(() => this.respawn(q), R.RESPAWN_MS);
    return true;
  }
  // ---- settlers ----
  dayFrac() { return (((now() - this.day0) % R.DAY_MS) + R.DAY_MS) % R.DAY_MS / R.DAY_MS; }
  isNight() { const f = this.dayFrac(); return f > 0.86 || f < 0.21; }
  ownerKey(pid) { return this.mode === "coop" ? "colony" : pid; }
  active(owner) { return owner === "colony" ? this.online.size > 0 : this.online.has(owner); }
  mineB(owner, b) { return owner === "colony" || b.owner === owner || this.sameNation(owner, b.owner); }
  homeOf(owner) { return Object.values(this.buildings).find(b => b.type === "hearth" && this.mineB(owner, b)) || null; }
  bedsOf(owner) { let n = 0; for (const b of Object.values(this.buildings)) if (this.mineB(owner, b)) n += R.BUILD[b.type].beds || 0; return Math.min(n, R.SETTLER.max); }
  storeFor(owner) { return owner === "colony" ? this.shared : this.recs[owner]; }
  stockTo(owner) { { const n = owner !== "colony" && this.natOf(owner); if (n) { for (const pid of Object.keys(this.nations[n].members)) { const q = this.online.get(pid); if (q) return this.stock(q); } return; } } if (owner === "colony") { this.all({ t: "stock", wood: this.shared.wood, stone: this.shared.stone, food: this.shared.food | 0 }); return; } const o = this.online.get(owner); if (o) this.stock(o); }
  tell(owner, text) { if (owner === "colony") this.note(text); else { const o = this.online.get(owner); if (o) o.sock.send({ t: "note", text }); } }
  pubS(v) { return { id: v.id, owner: v.owner, name: v.name, look: v.look, job: v.job, x: +v.x.toFixed(2), z: +v.z.toFixed(2), yaw: v.yaw || 0, a: v.a || "idle", hp: v.hp, pin: v.pin ? v.pin.field : null }; }
  // who comes, who goes, and who does what: every few seconds
  settle() {
    const t = now(), owners = new Set();
    for (const b of Object.values(this.buildings)) if (b.type === "hearth") owners.add(this.mode === "coop" ? "colony" : b.owner);
    for (const v of Object.values(this.settlers)) if (!owners.has(v.owner)) { delete this.settlers[v.id]; this.all({ t: "sx", id: v.id }); }   // (their town hall gone: they go)
    for (const owner of owners) {
      if (!this.active(owner)) continue;
      const home = this.homeOf(owner), beds = this.bedsOf(owner), list = Object.values(this.settlers).filter(v => v.owner === owner);
      // fewer beds than people (a house broken): the last to come leave
      for (const v of list.slice(beds)) { delete this.settlers[v.id]; this.all({ t: "sx", id: v.id, left: true }); }
      // they eat: a ration each, so often; with nothing in the store, no one new comes, and in time someone goes
      const store = this.storeFor(owner);
      if (store && list.length) {
        this.eatAcc ??= {}; this.eatAcc[owner] = (this.eatAcc[owner] || 0) + list.length * 3000 / R.FOOD.eatMs;
        const eat = Math.floor(this.eatAcc[owner]); if (eat > 0) { this.eatAcc[owner] -= eat; store.food = Math.max(0, (store.food | 0) - eat); this.stockTo(owner); this.dirty = true; }
        this.hungry ??= {};
        if ((store.food | 0) <= 0) {
          if (!this.hungry[owner]) { this.hungry[owner] = t; this.tell(owner, "There's no food in the store. Your settlers are going hungry — farm a field (B), or they'll leave."); }
          else if (t - this.hungry[owner] > R.FOOD.hungryLeaveMs) { this.hungry[owner] = t; const v = list[list.length - 1]; delete this.settlers[v.id]; this.all({ t: "sx", id: v.id, left: true }); this.tell(owner, `${v.name} has left — there was nothing to eat.`); continue; }
        } else this.hungry[owner] = 0;
      }
      if (list.length < beds && (!store || (store.food | 0) > 0) && t - (this.lastArrive[owner] || 0) > (START && START.fast ? 3000 : R.SETTLER.arriveMs)) {
        this.lastArrive[owner] = t;
        const look = LK.randomLook(crypto.randomInt(1, 1e9)), f = LK.isF(look);
        if (look.body === "brother") look.body = "townsman"; if (look.body === "sister") look.body = "townswoman";
        const names = R.SETTLER_NAMES[LK.isF(look) ? "f" : "m"];
        // (they come out of the woods, from a way off, and walk in: never just there by the fire)
        let a = Math.random() * 6.28, far = 4;
        for (let i = 0; i < 24; i++) {
          const aa = Math.random() * 6.28, r = 45 + Math.random() * 20, x = home.x + Math.cos(aa) * r, z = home.z + Math.sin(aa) * r;
          if (Math.abs(x) > this.half - 12 || Math.abs(z) > this.half - 12) continue;
          let dry = true; for (let k = 0; k <= 10; k++) { const f = k / 10; if (this.land.heightAt(home.x + (x - home.x) * f, home.z + (z - home.z) * f) < 0.4) { dry = false; break; } }
          if (dry) { a = aa; far = r; break; }
        }
        const v = { id: "s" + (this.nextS++), owner, name: names[crypto.randomInt(0, names.length)], look, job: "wood", x: home.x + Math.cos(a) * far, z: home.z + Math.sin(a) * far, yaw: 0, a: "idle", s: 0, hp: R.SETTLER.hp, state: "find" };
        void f;
        if (far > 4) v.state = "arrive";
        this.settlers[v.id] = v;
        this.all({ t: "sj", s: this.pubS(v) });
        const o = owner === "colony" ? null : this.online.get(owner);
        const msg = far > 4 ? `${v.name} is coming through the woods to live ${owner === "colony" ? "in the colony" : "with you"}.` : `${v.name} has come to live ${owner === "colony" ? "in the colony" : "with you"}.`;
        { const count = Object.values(this.settlers).filter(x => x.owner === owner).length; if (count === 4 || count === 8 || count === 12) this.headline("grow", `${owner === "colony" ? "The colony" : (this.recs[owner] ? this.recs[owner].name + "'s homestead" : "A homestead")} has grown to ${count} settlers.`); }
        if (o) o.sock.send({ t: "note", text: msg }); else if (owner === "colony") this.note(msg);
        this.dirty = true;
      }
      // the work: a watch for every tower (two to each), a third at the stone if logs are plenty, the rest at the trees
      const now2 = Object.values(this.settlers).filter(v => v.owner === owner);
      const towers = Object.values(this.buildings).filter(b => b.type === "tower" && this.mineB(owner, b)).length;
      const st = this.storeFor(owner) || { wood: 0, stone: 0 };
      const fields = Object.values(this.buildings).filter(b => b.type === "field" && this.mineB(owner, b)).length;
      for (const v of now2) if (v.pin && !this.buildings[v.pin.field]) v.pin = null;
      const pinned = now2.filter(v => v.pin);
      let watch = Math.min(now2.length - pinned.length, towers * R.SETTLER.guardsPerTower), farm = Math.max(0, Math.min(now2.length - pinned.length - watch, fields - new Set(pinned.map(v => v.pin.field)).size)), stoneN = st.wood > st.stone * 3 + 20 ? Math.floor((now2.length - watch - farm) / 3) : 0;
      for (const v of now2) {
        if (v.pin) continue;
        const want = watch > 0 ? (watch--, "watch") : farm > 0 ? (farm--, "farm") : stoneN > 0 ? (stoneN--, "stone") : "wood";
        if (v.job !== want) { v.job = want; v.state = v.carry ? "home" : "find"; v.target = null; this.all({ t: "sjob", id: v.id, job: want }); }
      }
    }
  }
  // the trees (or rocks) within reach of a homestead, nearest first: worked out now and then, not every step
  workList(owner, home, kind) {
    const k = owner + ":" + kind, c = this.workCache[k], t = now();
    if (c && t - c.at < 30000 && c.x === home.x) return c.list;
    const out = [], R2 = R.SETTLER.reach, C = T.CHUNK;
    for (let ci = Math.floor((home.x - R2) / C); ci <= Math.floor((home.x + R2) / C); ci++) for (let cj = Math.floor((home.z - R2) / C); cj <= Math.floor((home.z + R2) / C); cj++) {
      for (const it of kind === "wood" ? this.land.chunkTrees(ci, cj) : this.land.chunkRocks(ci, cj)) {
        const d = Math.hypot(it.x - home.x, it.z - home.z); if (d > R2 || d < 6) continue;
        // (not one cleared away for a building, under it or in its yard)
        if (Object.values(this.buildings).some(b => { const bd = R.BUILD[b.type]; return bd && !bd.wall && Math.hypot(b.x - it.x, b.z - it.z) < Math.max(bd.w || 0, bd.d || 0, (bd.r || 1) * 1.5) / 2 + 3.5; })) continue;
        // (only what can be walked to: no water on the way)
        let dry = true; for (let i = 1; i < 6; i++) { const f = i / 6; if (this.land.heightAt(home.x + (it.x - home.x) * f, home.z + (it.z - home.z) * f) < 0.3) { dry = false; break; } }
        if (dry) out.push({ id: it.id, x: it.x, z: it.z, d });
      }
    }
    out.sort((a, b) => a.d - b.d);
    this.workCache[k] = { at: t, x: home.x, list: out };
    return out;
  }
  step(v, x, z, dt) {
    const dx = x - v.x, dz = z - v.z, d = Math.hypot(dx, dz); if (d < 0.05) return 0;
    const sp = Math.min(d, R.SETTLER.speed * (v.state === "flee" || v.state === "chase" ? 2 : 1) * dt);
    v.x += dx / d * sp; v.z += dz / d * sp; v.yaw = Math.atan2(dx, dz); v.s = sp / dt; v.a = "idle"; v.moved = true;
    return d - sp;
  }
  // every fifth of a second: each settler a step further on with what they're doing
  ai(dt) {
    const t = now();
    const taken = new Set(Object.values(this.settlers).map(v => v.target && v.target.id).filter(Boolean));
    for (const v of Object.values(this.settlers)) {
      if (!this.active(v.owner)) { if (v.s) { v.s = 0; v.a = "idle"; v.moved = true; } continue; }
      const home = this.homeOf(v.owner); if (!home) continue;
      if (v.hp < R.SETTLER.hp && t - (v.hurtAt || 0) > 10000) v.hp = Math.min(R.SETTLER.hp, v.hp + 2);
      const idle = () => { if (v.s || v.a !== "idle") { v.s = 0; v.a = "idle"; v.moved = true; } };
      // on the way in, through the trees to the town hall; then to work
      if (v.state === "arrive") { if (this.step(v, home.x + 3, home.z + 3, dt) < 1.5) { v.state = "find"; idle(); } continue; }
      if (v.state === "flee") { const dx = v.x - v.from.x, dz = v.z - v.from.z, d = Math.hypot(dx, dz) || 1; if (t > v.until) v.state = v.carry ? "home" : "find"; else this.step(v, v.x + dx / d * 5, v.z + dz / d * 5, dt); continue; }
      if (v.job === "watch") {
        // anyone hostile on our ground: go for them
        const claim = R.BUILD.hearth.claim + 8;
        let foe = null, fd = Infinity;
        if (this.mode !== "coop") for (const q of this.online.values()) {
          if (q.dead || this.allied(q.pid, v.owner) || q.shield > t) continue;
          if (Math.hypot(q.x - home.x, q.z - home.z) > claim) continue;
          const d = Math.hypot(q.x - v.x, q.z - v.z); if (d < fd) { fd = d; foe = q; }
        }
        if (foe) {
          v.state = "chase";
          if (fd > 1.7) this.step(v, foe.x, foe.z, dt);
          else { idle(); v.yaw = Math.atan2(foe.x - v.x, foe.z - v.z); if (t - (v.lastHit || 0) > 1300) { v.lastHit = t; v.a = "chop"; v.moved = true; this.damage(foe, R.SETTLER.guardHit, v.id, v.x, v.z); } }
          continue;
        }
        v.state = "post";
        const towers = Object.values(this.buildings).filter(b => b.type === "tower" && this.mineB(v.owner, b));
        const post = towers.length ? towers[Number(v.id.slice(1)) % towers.length] : home, a = (Number(v.id.slice(1)) * 2.4) % 6.28;
        if (this.step(v, post.x + Math.cos(a) * 3.5, post.z + Math.sin(a) * 3.5, dt) <= 0.1) idle();
        continue;
      }
      // night: home to bed (in a cabin or house of theirs), out again in the morning
      if (this.isNight()) {
        if (v.state !== "bed" && v.state !== "sleep") { if (v.carry) { const st = this.storeFor(v.owner); if (st) { st[v.carryKind === "stone" ? "stone" : "wood"] += v.carry; this.stockTo(v.owner); } v.carry = 0; } v.target = null; v.state = "bed"; }
        if (v.state === "bed") {
          const beds = Object.values(this.buildings).filter(b => (R.BUILD[b.type].beds || 0) > 0 && this.mineB(v.owner, b));
          const bed = beds[Number(v.id.slice(1)) % Math.max(1, beds.length)] || home;
          if (this.step(v, bed.x + Math.sin(bed.ry || 0) * 3.4, bed.z + Math.cos(bed.ry || 0) * 3.4, dt) <= 0.3) { v.state = "sleep"; v.a = "sleep"; v.s = 0; v.moved = true; }
        }
        continue;
      }
      if (v.state === "bed" || v.state === "sleep") { v.state = "find"; v.a = "idle"; v.moved = true; }
      if (v.job === "farm") {
        // their field: the one with their number on it, of those the owner has
        const fields = Object.values(this.buildings).filter(b => b.type === "field" && this.mineB(v.owner, b));
        const free = fields.filter(b => !Object.values(this.settlers).some(o => o.pin && o.pin.field === b.id));
        const f = v.pin ? this.buildings[v.pin.field] : (free.length ? free : fields)[Number(v.id.slice(1)) % Math.max(1, (free.length ? free : fields).length)]; if (!f) { idle(); continue; }
        const c = Math.cos(f.ry || 0), sn = Math.sin(f.ry || 0), lane = ((t / 9000 + Number(v.id.slice(1))) % 3) - 1, along = Math.sin(t / 4000 + Number(v.id.slice(1))) * 2.6;
        const gx = f.x + lane * 2.2 * c + along * sn, gz = f.z - lane * 2.2 * sn + along * c;
        if (Math.hypot(gx - v.x, gz - v.z) > 0.6 && v.state !== "reap") { this.step(v, gx, gz, dt * 0.6); continue; }
        f.growth = f.growth || 0;
        if (v.state === "reap") {
          if (v.a !== "reap") { v.a = "reap"; v.moved = true; }
          if (t >= v.until) {
            const st = this.storeFor(v.owner), well = Object.values(this.buildings).some(b => b.type === "well" && this.mineB(v.owner, b));
            if (st) st.food = (st.food | 0) + R.FOOD.harvest + (well ? R.FOOD.wellBonus : 0);
            f.growth = 0; this.all({ t: "bg", id: f.id, growth: 0 }); this.stockTo(v.owner); v.state = "farm"; this.dirty = true;
          }
          continue;
        }
        v.state = "farm"; v.s = 0;
        if (v.a !== "dig") { v.a = "dig"; v.moved = true; }
        const g0 = f.growth; f.growth = Math.min(1, f.growth + dt * 1000 / R.FOOD.growMs);
        if (Math.floor(g0 * 3) !== Math.floor(f.growth * 3)) { this.all({ t: "bg", id: f.id, growth: f.growth }); this.dirty = true; }
        if (f.growth >= 1) { v.state = "reap"; v.until = t + R.FOOD.reapMs; }
        continue;
      }
      const kind = v.job === "stone" ? "stone" : "wood";
      if (v.state === "rest") { idle(); if (t > v.until) v.state = "find"; continue; }
      if (v.state === "find") {
        const gone = kind === "wood" ? this.felled : this.broken;
        const it = this.workList(v.owner, home, kind).find(w => !(gone[w.id] > t) && !taken.has(w.id));
        if (!it) { v.state = "rest"; v.until = t + 8000; continue; }
        v.target = it; taken.add(it.id); v.state = "go";
      }
      if (v.state === "go" || v.state === "work") {
        const it = v.target, gone = kind === "wood" ? this.felled : this.broken;
        if (!it || gone[it.id] > t) { v.state = "find"; v.target = null; continue; }
        const dx = v.x - it.x, dz = v.z - it.z, d = Math.hypot(dx, dz) || 1, stand = kind === "wood" ? 1.3 : 2.0;
        if (v.state === "go") {
          if (this.step(v, it.x + dx / d * stand, it.z + dz / d * stand, dt) <= 0.1) { v.state = "work"; v.until = t + (kind === "wood" ? R.SETTLER.chopMs : R.SETTLER.mineMs); }
          continue;
        }
        v.s = 0; v.yaw = Math.atan2(it.x - v.x, it.z - v.z); if (v.a !== "chop") { v.a = "chop"; v.moved = true; }
        if (t < v.until) continue;
        if (kind === "wood") { this.felled[it.id] = t + R.REGROW_MS; this.all({ t: "fell", id: it.id, by: v.id, dx: -dx / d, dz: -dz / d }); v.carry = R.SETTLER.logs; }
        else { this.broken[it.id] = t + R.REGROW_MS; this.all({ t: "rock", id: it.id, by: v.id }); v.carry = R.SETTLER.stone; }
        v.carryKind = kind; v.target = null; v.state = "home"; this.dirty = true;
        continue;
      }
      if (v.state === "home") {
        // (logs to a site of ours that wants them, first — as the settlement's haulers do; else to the store)
        const site = v.carryKind === "wood" ? Object.values(this.sites).filter(q => this.mineB(v.owner, q) && q.logs < R.BUILD[q.type].wood).sort((a, b) => Math.hypot(a.x - v.x, a.z - v.z) - Math.hypot(b.x - v.x, b.z - v.z))[0] : null;
        if (site) {
          if (this.step(v, site.x + 1.8, site.z + 1.2, dt) <= 0.3) {
            const n = Math.min(v.carry || 0, R.BUILD[site.type].wood - site.logs); site.logs += n; v.carry -= n;
            this.all({ t: "site", s: site }); this.dirty = true;
            if (!v.carry) { v.state = "rest"; v.until = t + 2500; }
          }
          continue;
        }
        const sheds = Object.values(this.buildings).filter(b => b.type === "shed" && this.mineB(v.owner, b));
        let drop = home, dd = Math.hypot(home.x - v.x, home.z - v.z);
        for (const b of sheds) { const d = Math.hypot(b.x - v.x, b.z - v.z); if (d < dd) { dd = d; drop = b; } }
        if (this.step(v, drop.x + 2.2, drop.z + 1.2, dt) <= 0.3) {
          const st = this.storeFor(v.owner); if (st && v.carry) { st[v.carryKind === "stone" ? "stone" : "wood"] += v.carry; this.stockTo(v.owner); }
          v.carry = 0; v.state = "rest"; v.until = t + 2500; this.dirty = true;
        }
      }
    }
  }
  // the wars, every few seconds: who's at the town hall, and how far the taking of it has gone
  warTick(t) {
    let changed = false;
    for (const w of this.wars.slice()) {
      const h = this.buildings[w.hearth];
      const end = (text, kind = "war") => { this.wars.splice(this.wars.indexOf(w), 1); this.lastWar[w.def] = t; this.headline(kind, text); changed = true; };
      if (!h || h.owner !== w.def) { end(`The war over ${w.defName}'s homestead is over.`); continue; }
      if (t - w.start > R.WAR.lastsMs) { end(`${w.defName} held their homestead against ${w.attName}.`); continue; }
      if (!this.online.has(w.def)) continue;         // (the defender away: the war waits for them)
      const near = (pid, ok) => [...this.online.values()].filter(q => !q.dead && ok(q.pid) && Math.hypot(q.x - h.x, q.z - h.z) < R.WAR.radius).length
        + Object.values(this.settlers).filter(v => ok(v.owner) && Math.hypot(v.x - h.x, v.z - h.z) < R.WAR.radius).length;
      const att = near(w.att, pid => pid === w.att || this.allied(pid, w.att)), def = near(w.def, pid => pid === w.def || this.allied(pid, w.def));
      const before = w.progress;
      const cap = R.WAR.captureMs / (START && START.fast ? 6 : 1);
      if (att > 0 && def === 0) w.progress = Math.min(1, w.progress + 3000 / cap);
      else if (def > 0 && att === 0) w.progress = Math.max(0, w.progress - 3000 / cap * R.WAR.decay);
      w.att_n = att; w.def_n = def;
      if (w.progress !== before) changed = true;
      if (w.progress >= 1) {
        // taken: the town hall and everything on its ground, and everyone who lived there
        const claim = R.BUILD.hearth.claim;
        let n = 0;
        for (const b of Object.values(this.buildings)) if (b.owner === w.def && Math.hypot(b.x - h.x, b.z - h.z) < claim + 2) { b.owner = w.att; n++; this.all({ t: "bown", id: b.id, owner: w.att }); }
        for (const v of Object.values(this.settlers)) if (v.owner === w.def) { v.owner = w.att; this.all({ t: "sown", id: v.id, owner: w.att }); }
        const vs = this.recs[w.def], as = this.recs[w.att];
        if (vs && as) { const half = k => { const x = Math.floor((vs[k] | 0) / 2); vs[k] = (vs[k] | 0) - x; as[k] = (as[k] | 0) + x; }; half("wood"); half("stone"); half("food"); }
        const o1 = this.online.get(w.att), o2 = this.online.get(w.def); if (o1) this.stock(o1); if (o2) this.stock(o2);
        end(`${w.attName} has taken ${w.defName}'s homestead — ${n} building${n === 1 ? "" : "s"} and all its people!`, "capture");
        this.dirty = true;
      }
    }
    if (changed) this.all({ t: "wars", wars: this.wars });
  }
  // ---- Classic: nations ----
  natState() { return { nats: this.nats, pacts: [...this.pacts], nwars: this.nwars, offers: [...this.offers.values()] }; }
  natPush() { this.all({ t: "nstate", ...this.natState() }); }
  pk(a, b) { return [a, b].sort().join("|"); }
  natName(pid) { const n = this.nats[pid]; return n ? n.nation : (this.recs[pid] ? this.recs[pid].name : "someone"); }
  atWar(a, b) { return this.nwars.find(w => (w.a === a && w.b === b) || (w.a === b && w.b === a)) || null; }
  sendTo(pid, msg) { const q = this.online.get(pid); if (q) q.sock.send(msg); return !!q; }
  endNWar(w, how) {
    this.nwars = this.nwars.filter(x => x !== w);
    this.lastNWar[this.pk(w.a, w.b)] = now();
    this.headline("peace", how);
    this.natPush();
  }
  nationsOn(p, m) {
    const me = p.pid, to = String(m.to || ""), t = now();
    const no = text => p.sock.send({ t: "err", text });
    switch (m.t) {
      case "st": case "respawn": return;
      case "chat": {
        const text = clean(m.text, 200); if (!text) return;
        const c = { pid: me, name: p.name, text }; this.chat.push(c); if (this.chat.length > 60) this.chat.shift();
        this.all({ t: "chat", ...c }); return;
      }
      // how a nation stands: its name, its people, its day — told now and then by its own game
      case "nat": {
        const was = this.nats[me];
        const hex = v => (/^#[0-9a-f]{6}$/i.test(String(v)) ? String(v) : null);
        const flag = m.flag && typeof m.flag === "object" ? { c1: hex(m.flag.c1) || "#8a3e2e", c2: hex(m.flag.c2) || "#d8ccb0", pattern: clean(m.flag.pattern, 16) || "plain", emblem: clean(m.flag.emblem, 16) || "none" } : null;
        const n = { pid: me, flag, ruler: p.name, nation: clean(m.nation, 40) || `${p.name}'s people`, pop: num(m.pop) | 0, day: num(m.day) | 0, coin: num(m.coin) | 0, watch: num(m.watch) | 0, built: num(m.built) | 0, known: num(m.known) | 0, at: t };
        this.nats[me] = n;
        if (was) for (const k of [10, 25, 50]) if (was.pop < k && n.pop >= k) this.headline("grow", `${n.nation} has grown to ${k} souls.`);
        if (!was || was.nation !== n.nation || was.pop !== n.pop || was.day !== n.day || was.watch !== n.watch || JSON.stringify(was.flag) !== JSON.stringify(n.flag)) this.natPush();
        return;
      }
      // alliances: asked, and accepted or turned down; broken by either
      case "pact": {
        if (!this.online.has(to) || to === me) return;
        if (this.atWar(me, to)) return no("You're at war with them. Make peace first.");
        if (this.pacts.has(this.pk(me, to))) return;
        this.pactAsk.set(this.pk(me, to), { from: me, at: t });
        this.sendTo(to, { t: "ask", kind: "pact", from: me, name: this.natName(me) });
        return no(`You've offered ${this.natName(to)} an alliance. It's for them to accept.`);
      }
      case "pactok": {
        const k = this.pk(me, to), a = this.pactAsk.get(k); if (!a || a.from !== to) return;
        this.pactAsk.delete(k); this.pacts.add(k);
        this.headline("ally", `${this.natName(to)} and ${this.natName(me)} have sworn an alliance.`);
        this.natPush(); return;
      }
      case "pactno": { const k = this.pk(me, to), a = this.pactAsk.get(k); if (!a || a.from !== to) return; this.pactAsk.delete(k); this.sendTo(to, { t: "err", text: `${this.natName(me)} has turned down your alliance.` }); return; }
      case "unpact": {
        const k = this.pk(me, to); if (!this.pacts.delete(k)) return;
        this.headline("ally", `${this.natName(me)} has broken its alliance with ${this.natName(to)}.`);
        this.natPush(); return;
      }
      // war: only on a nation that's here to defend itself, and not an ally, and not straight after a peace
      case "war": {
        if (!this.online.has(to) || to === me) return no("They aren't here. No one can be attacked while they're away.");
        if (this.pacts.has(this.pk(me, to))) return no("You're allies. Break the alliance first.");
        if (this.atWar(me, to)) return;
        const last = this.lastNWar[this.pk(me, to)] || 0;
        if (t - last < R.WAR.cooldownMs) return no(`The peace is too new. In ${Math.ceil((R.WAR.cooldownMs - (t - last)) / 60000)} min you can break it.`);
        const w = { a: me, b: to, aName: this.natName(me), bName: this.natName(to), start: t };
        this.nwars.push(w);
        this.headline("war", `${w.aName} has declared war on ${w.bName}.`);
        this.natPush(); return;
      }
      case "peace": {
        const w = this.atWar(me, to); if (!w) return;
        this.peaceAsk.set(this.pk(me, to), { from: me, at: t });
        this.sendTo(to, { t: "ask", kind: "peace", from: me, name: this.natName(me) });
        return no(`You've sued ${this.natName(to)} for peace. It's for them to accept.`);
      }
      case "peaceok": {
        const k = this.pk(me, to), a = this.peaceAsk.get(k), w = this.atWar(me, to); if (!a || a.from !== to || !w) return;
        this.peaceAsk.delete(k);
        this.endNWar(w, `${this.natName(to)} and ${this.natName(me)} have made peace.`); return;
      }
      case "peaceno": { const k = this.pk(me, to), a = this.peaceAsk.get(k); if (!a || a.from !== to) return; this.peaceAsk.delete(k); this.sendTo(to, { t: "err", text: `${this.natName(me)} won't hear of peace.` }); return; }
      // trade: what one offers, held here until the other takes it or turns it down (the goods were set aside by the giver's own game)
      case "offer": {
        if (!this.online.has(to) || to === me) return;
        const goods = g => { const o = {}; for (const [k, v] of Object.entries(g || {})) if (R.NATION_GOODS[k] && num(v) > 0) o[k] = Math.min(9999, num(v) | 0); return o; };
        const o = { id: "o" + this.nextO++, from: me, to, fromName: this.natName(me), toName: this.natName(to), give: goods(m.give), want: goods(m.want), at: t };
        if (!Object.keys(o.give).length && !Object.keys(o.want).length) return;
        this.offers.set(o.id, o);
        this.sendTo(to, { t: "offer", o }); p.sock.send({ t: "offer", o });
        return;
      }
      case "accept": {
        const o = this.offers.get(String(m.id)); if (!o || o.to !== me) { p.sock.send({ t: "got", goods: m.paid || {}, why: "That offer is gone." }); return; }
        this.offers.delete(o.id);
        p.sock.send({ t: "got", goods: o.give, id: o.id, why: `The trade with ${o.fromName} is done.` });
        this.sendTo(o.from, { t: "got", goods: o.want, id: o.id, why: `${o.toName} took your offer.` });
        if (Object.keys(o.want).length) this.headline("trade", `${o.fromName} and ${o.toName} have traded.`);
        else this.headline("trade", `${o.fromName} has sent ${o.toName} a gift.`);
        return;
      }
      case "decline": case "cancel": {
        const o = this.offers.get(String(m.id)); if (!o || (m.t === "decline" ? o.to !== me : o.from !== me)) return;
        this.offers.delete(o.id);
        this.sendTo(o.from, { t: "got", goods: o.give, id: o.id, back: true, why: m.t === "decline" ? `${o.toName} turned down your offer; the goods are back in your stores.` : "You took back your offer." });
        this.sendTo(o.to, { t: "offergone", id: o.id });
        return;
      }
      // a war party: so many of your people, sent up the enemy's road; their game fights it out, and says how it went
      case "raid": {
        const w = this.atWar(me, to); if (!w) return no("You're not at war with them.");
        if (!this.online.has(to)) return no("They aren't here.");
        if ([...this.forays.values()].some(f => f.from === me && !f.over)) return no("Your war party is still out.");
        const n = Math.max(1, Math.min(10, num(m.n) | 0)), id = "f" + this.nextO++;
        const lead = !!m.lead;
        this.forays.set(id, { id, from: me, to, n, at: t, lead, people: Array.isArray(m.people) ? m.people.slice(0, 10).map(x => clean(x, 40)) : [] });
        this.sendTo(to, { t: "raided", id, from: me, name: this.natName(me), n, lead, ruler: p.name, look: p.look });
        p.sock.send({ t: "foray", id, to });
        // the defender's allies hear of it, and may go to their aid
        for (const k of this.pacts) { const [a, b] = k.split("|"), ally = a === to ? b : b === to ? a : null; if (ally && ally !== me && this.online.has(ally)) this.sendTo(ally, { t: "callaid", id, to, toName: this.natName(to), fromName: this.natName(me), n }); }
        this.headline("war", lead ? `${p.name} of ${this.natName(me)} marches against ${this.natName(to)} at the head of ${n} armed men.` : `${this.natName(me)} has sent ${n} armed men against ${this.natName(to)}.`);
        return;
      }
      // a battle led in person: the defender's game shows it to the one leading the attack, and is told what they do
      case "bh": { const f = [...this.forays.values()].find(f => f.to === me && ((f.lead && f.from === to) || (f.aid && f.aid.has(to)))); if (f) this.sendTo(to, { t: "h", m: m.m }); return; }
      case "bg": { const f = [...this.forays.values()].find(f => f.to === to && ((f.lead && f.from === me) || (f.aid && f.aid.has(me)))); if (f) this.sendTo(to, { t: "g", from: me, m: m.m }); return; }
      // an ally going to the aid of a nation that's under attack
      case "aid": {
        const f = this.forays.get(String(m.id || "")); if (!f || f.over || !this.online.has(f.to) || !this.pacts.has(this.pk(me, f.to))) return no("That fight is over, or they're no ally of yours.");
        (f.aid ??= new Set()).add(me);
        this.sendTo(f.to, { t: "aidjoin", id: f.id, from: me, name: p.name, nation: this.natName(me), look: p.look });
        this.headline("ally", `${p.name} of ${this.natName(me)} has gone to the aid of ${this.natName(f.to)}.`);
        return;
      }
      case "raidEnd": {
        const f = this.forays.get(String(m.id)); if (!f || f.to !== me || f.over) return;
        // (kept a minute more: the defender's game still has its last words for whoever came to the fight)
        f.over = t;
        const down = Math.max(0, Math.min(f.n, num(m.down) | 0)), loot = {};
        for (const [k, v] of Object.entries(m.loot || {})) if (R.NATION_GOODS[k] && num(v) > 0) loot[k] = Math.min(999, num(v) | 0);
        this.sendTo(f.from, { t: "raidBack", id: f.id, n: f.n, down, loot, name: this.natName(me) });
        const got = Object.values(loot).some(v => v > 0);
        this.headline("war", down >= f.n ? `${this.natName(me)} cut down every one of the ${f.n} men ${this.natName(f.from)} sent against it.` : `${this.natName(f.from)}'s war party came back from ${this.natName(me)}${got ? " with plunder" : " empty-handed"}${down ? `, ${down} of ${f.n} left dead on the road` : ""}.`);
        return;
      }
    }
  }
  // someone gone: their offers are void, their wars end, a war party sent against them comes home
  natGone(pid) {
    for (const o of [...this.offers.values()]) if (o.from === pid || o.to === pid) {
      this.offers.delete(o.id);
      if (o.from !== pid) this.sendTo(o.from, { t: "got", goods: o.give, id: o.id, back: true, why: `${o.toName} has gone; your offer's goods are back in your stores.` });
      else this.sendTo(o.to, { t: "offergone", id: o.id });
    }
    for (const f of [...this.forays.values()]) if (f.to === pid) { this.forays.delete(f.id); if (!f.over) this.sendTo(f.from, { t: "raidBack", id: f.id, n: f.n, down: 0, loot: {}, name: this.natName(pid), gone: true }); }
    else if (f.from === pid) this.forays.delete(f.id);
    for (const w of this.nwars.slice()) if (w.a === pid || w.b === pid) this.endNWar(w, `The war between ${w.aName} and ${w.bName} is over: ${this.natName(pid)} has gone from the world.`);
    delete this.nats[pid];
    this.natPush();
  }
  hasForge(pid) { return Object.values(this.buildings).some(b => b.type === "forge" && this.allied(b.owner, pid)); }
  quitGroup(pid) {
    const r = this.recs[pid]; if (!r || !r.group) return;
    const g = this.groups[r.group]; r.group = null;
    if (!g) return;
    g.members = g.members.filter(x => x !== pid);
    if (g.members.length < 2) { for (const x of g.members) if (this.recs[x]) this.recs[x].group = null; delete this.groups[Object.keys(this.groups).find(k => this.groups[k] === g)]; }
  }
  respawn(q) {
    if (!this.online.has(q.pid)) return;
    const hearth = Object.values(this.buildings).find(b => b.type === "hearth" && (b.owner === q.pid || this.mode === "coop"));
    const at = hearth ? { x: hearth.x + 2.5, z: hearth.z + 2.5 } : this.land.findHome(T.seq(crypto.randomInt(1, 1e9)), [], 0, this.persistent ? null : this.spawnAt, 60);
    q.x = at.x; q.z = at.z; q.y = this.land.heightAt(at.x, at.z); q.hp = R.MAX_HP; q.dead = false; q.shield = now() + 10000;
    this.all({ t: "spawn", pid: q.pid, x: q.x, z: q.z, hp: q.hp });
  }
  // ---- every tenth of a second: where everyone is; every few seconds, what has grown back ----
  tick() {
    const moved = [];
    for (const p of this.online.values()) if (p.moved) { p.moved = false; moved.push([p.pid, +p.x.toFixed(2), +p.y.toFixed(2), +p.z.toFixed(2), +p.yaw.toFixed(3), p.a, p.h, +p.s.toFixed(2), p.g ? 1 : 0]); }
    if (moved.length) this.all({ t: "ps", l: moved });
    if ((this.tickN = (this.tickN || 0) + 1) % 2 === 0) {
      if (this.mode !== "colony" && this.mode !== "nations") { this.ai(0.2); this.wild(0.2); }
      const sm = [];
      for (const v of Object.values(this.settlers)) if (v.moved) { v.moved = false; sm.push([v.id, +v.x.toFixed(2), +v.z.toFixed(2), +v.yaw.toFixed(2), v.a, +(v.s || 0).toFixed(2)]); }
      if (sm.length) this.all({ t: "ss", l: sm });
      const bm = []; for (const o of Object.values(this.boats || {})) if (o.moved) { o.moved = false; bm.push([o.id, +o.x.toFixed(2), +o.z.toFixed(2), +o.yaw.toFixed(3)]); }
      if (bm.length) this.all({ t: "bm", l: bm });
    }
  }
  slow() {
    const t = now(), back = [], rocks = [];
    for (const [id, at] of Object.entries(this.felled)) if (at <= t) { delete this.felled[id]; back.push(id); }
    for (const [id, at] of Object.entries(this.broken)) if (at <= t) { delete this.broken[id]; rocks.push(id); }
    if (back.length || rocks.length) { this.all({ t: "grow", trees: back, rocks }); this.dirty = true; }
    if (this.mode !== "colony" && this.mode !== "nations") this.settle();
    if (this.wars.length) this.warTick(t);
    for (const f of [...this.forays.values()]) if (f.over && t - f.over > 60000) this.forays.delete(f.id);
    for (const w of this.nwars.slice()) if (t - w.start > R.WAR.lastsMs * 2) this.endNWar(w, `The war between ${w.aName} and ${w.bName} has burnt itself out. There's peace, of a kind.`);
    for (const [k, at] of this.invites) if (t - at > 120000) this.invites.delete(k);
    // a sack left lying a few minutes is gone (picked over, or the crows had it)
    for (const d of Object.values(this.drops)) if (t - d.at > 180000) { delete this.drops[d.id]; this.all({ t: "dropgone", id: d.id }); }
    // wounds mend, a while after the last blow
    for (const p of this.online.values()) if (!p.dead && p.hp < R.MAX_HP && t - (p.hurtAt || 0) > 8000 && t - (p.lastStarve || 0) > 12000) { p.hp = Math.min(R.MAX_HP, p.hp + 4); this.all({ t: "hp", pid: p.pid, hp: p.hp, heal: true }); }
  }
}

// ---------------------------------------------------------------------------
//  the server
// ---------------------------------------------------------------------------
async function start(opts = {}) {
  const base = pathToFileURL(path.join(__dirname, "..", "js", "mp") + path.sep).href;
  R = await import(base + "rules.js"); T = await import(base + "terrain.js"); LK = await import(base + "look.js"); F = await import(base + "fauna.js");
  if (opts.stock) START = { wood: +opts.stock, stone: +opts.stock, fast: true, hour: opts.hour != null ? +opts.hour : null };
  const rooms = new Map();
  const name = clean(opts.name, 40) || (opts.world ? "Forester: Reckoning" : `${os.hostname().replace(/\.(local|lan|home)$/, "")}'s games`);
  const dataDir = opts.data ? path.resolve(opts.data) : null;
  const log = opts.log || (opts.quiet ? () => {} : (...a) => console.log(`[${new Date().toISOString()}]`, ...a));
  // the wide world: from disk, or made new
  let world = null;
  if (opts.world) {
    const f = dataDir && path.join(dataDir, "world.json");
    try { if (f && fs.existsSync(f)) world = Room.from(JSON.parse(fs.readFileSync(f, "utf8"))); } catch (e) { log("world file unreadable:", e.message); }
    // (a new world saved at once, so it's this world from now on — not a fresh seed every time the server starts while
    //  no one has yet built in it)
    if (!world) { world = new Room({ id: "world", name: "The Wide World", mode: "pvp", kind: "earth", max: 500, persistent: true, half: R.WORLD_HALF, seed: opts.seed }); world.dirty = true; }
    world.id = "world";
    // (a world saved at another scale — or on another map — is laid out again on the Earth at the full scale: everything
    //  built stays where it stood on the globe, the trees and rocks grown afresh)
    if (world.half !== R.WORLD_HALF || world.kind !== "earth") {
      const k = R.WORLD_HALF / (world.half || R.WORLD_HALF), mv = o => { if (o && Number.isFinite(o.x)) { o.x = +(o.x * k).toFixed(2); o.z = +(o.z * k).toFixed(2); } };
      for (const coll of [world.buildings, world.sites, world.piles, world.settlers]) for (const o of Object.values(coll || {})) mv(o);
      for (const r of Object.values(world.recs || {})) { mv(r); if (r.home) mv(r.home); }
      log(`the wide world: laid out again at ${R.WORLD_HALF * 2 / 1000} km across (from ${(world.half * 2 / 1000).toFixed(1)})`);
      world.half = R.WORLD_HALF; world.kind = "earth"; world.land = T.makeTerrain(world.seed, world.half, world.kind);
      world.felled = {}; world.broken = {}; world.spawnAt = world.land.findHome(T.seq(world.seed ^ 0x5eed), [], 0); world.dirty = true;
    }
    rooms.set(world.id, world);
    log(`the wide world: seed ${world.seed}, ${Object.keys(world.recs).length} players known, ${Object.keys(world.buildings).length} buildings`);
  }
  const saveWorld = () => {
    if (!world || !dataDir || !world.dirty) return;
    world.dirty = false;
    try { fs.mkdirSync(dataDir, { recursive: true }); const f = path.join(dataDir, "world.json"); fs.writeFileSync(f + ".tmp", JSON.stringify(world)); fs.renameSync(f + ".tmp", f); }
    catch (e) { log("couldn't save the world:", e.message); }
  };
  // (the games a person may see: the public ones, and the private ones they're invited to — marked so)
  const list = (who = null) => [...rooms.values()].filter(r => !r.ended && r.canSee(who)).map(r => ({ ...r.meta(), invited: r.private && !!who && who.pid !== r.hostPid ? true : undefined }));
  const stats = () => ({ ok: true, name, protocol: R.PROTOCOL, world: !!world, games: rooms.size - (world ? 1 : 0), players: [...rooms.values()].reduce((a, r) => a + r.online.size, 0) });

  const server = http.createServer((req, res) => {
    const u = new URL(req.url, "http://x");
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Content-Type", "application/json");
    if (u.pathname === "/rooms") { const who = u.searchParams.get("pid") || u.searchParams.get("name") || u.searchParams.get("user") ? { pid: String(u.searchParams.get("pid") || ""), name: String(u.searchParams.get("name") || ""), user: userOf(u.searchParams.get("user")) } : null; return res.end(JSON.stringify({ ...stats(), rooms: list(who) })); }
    if (u.pathname === "/" || u.pathname === "/status") return res.end(JSON.stringify(stats()));
    // a licence key, checked with the shop (Lemon Squeezy's licence API) for a game that can't ask it itself
    if (u.pathname === "/licence") return licence(u, res, req);
    // the shop itself: the game sold through Stripe, and its own keys (see shop.cjs)
    if (u.pathname.startsWith("/shop/")) { shop.handle(u, req, res).catch(e => { log("shop:", e.message); if (!res.writableEnded) { res.statusCode = 500; res.end("{}"); } }); return; }
    // the battles fought, as they were: sent in when each is over; listed (the latest, or a commander's best); fetched
    if (u.pathname === "/replays" || u.pathname.startsWith("/replays/")) return replays(u, res, req);
    res.statusCode = 404; res.end("{}");
  });
  // ---- replays: every battle recorded on the games that fought it, kept here for anyone to watch ----
  // (on disk, if there's a disk: the newest few hundred, and each commander's best and latest whatever their age; in
  //  memory otherwise, fewer)
  const zlib = require("zlib");
  const repDir = dataDir ? path.join(dataDir, "replays") : null, repIndexFile = repDir && path.join(repDir, "index.json");
  let repIndex = []; try { if (repIndexFile && fs.existsSync(repIndexFile)) repIndex = JSON.parse(fs.readFileSync(repIndexFile, "utf8")) || []; } catch (e) { repIndex = []; }
  const repMem = new Map(), repAsks = new Map();
  const REP_KEEP = repDir ? 400 : 40, REP_EACH = 3, REP_MAX = 6 * 1024 * 1024, REP_RAW = 48 * 1024 * 1024;
  const repFile = id => path.join(repDir, id + ".json.gz");
  let repSaveT = null;
  const repSave = () => { if (!repIndexFile || repSaveT) return; repSaveT = setTimeout(() => { repSaveT = null; try { fs.writeFileSync(repIndexFile + ".tmp", JSON.stringify(repIndex)); fs.renameSync(repIndexFile + ".tmp", repIndexFile); } catch (e) { log("couldn't save the replay index:", e.message); } }, 2000); };
  // (the newest kept, and for every commander their best few and their latest few — the rest let go)
  const repPrune = () => {
    const keep = new Set(repIndex.slice().sort((a, b) => b.at - a.at).slice(0, REP_KEEP).map(r => r.id)), by = {};
    for (const r of repIndex) if (r.pid) (by[r.pid] ||= []).push(r);
    for (const l of Object.values(by)) { for (const r of l.slice().sort((a, b) => b.score - a.score).slice(0, REP_EACH)) keep.add(r.id); for (const r of l.slice().sort((a, b) => b.at - a.at).slice(0, REP_EACH)) keep.add(r.id); }
    for (const r of repIndex) if (!keep.has(r.id)) { repMem.delete(r.id); if (repDir) try { fs.unlinkSync(repFile(r.id)); } catch (e) {} }
    repIndex = repIndex.filter(r => keep.has(r.id));
  };
  const repPublic = r => ({ id: r.id, at: r.at, pid: r.pid, name: r.name, foe: r.foe, kind: r.kind, vs: r.vs, place: r.place, hour: r.hour, won: r.won, k: r.k, l: r.l, secs: r.secs, score: r.score, uni: r.uni, men: r.men, hl: r.hl });
  function replays(u, res, req) {
    if (req.method === "OPTIONS") { res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS"); res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Token"); res.statusCode = 204; return res.end(); }
    const id = u.pathname.slice("/replays/".length);
    if (req.method === "GET" && id) {
      if (!/^[a-f0-9]{12}$/.test(id) || !repIndex.some(r => r.id === id)) { res.statusCode = 404; return res.end("{}"); }
      const send = buf => { res.setHeader("Content-Encoding", "gzip"); res.setHeader("Cache-Control", "public, max-age=86400"); res.end(buf); };
      if (repMem.has(id)) return send(repMem.get(id));
      return fs.readFile(repFile(id), (e, buf) => { if (e) { res.statusCode = 404; return res.end("{}"); } send(buf); });
    }
    if (req.method === "GET") {
      const n = Math.max(1, Math.min(60, num(u.searchParams.get("n"), 20) | 0)), pid = String(u.searchParams.get("pid") || ""), sort = u.searchParams.get("sort") === "best" ? "best" : "recent";
      let l = pid ? repIndex.filter(r => r.pid === pid) : repIndex.slice();
      // (the recent ones worth watching: a battle that was over in a moment, nobody down, isn't)
      if (!pid) l = l.filter(r => r.hl > 0);
      l.sort(sort === "best" ? (a, b) => b.score - a.score || b.at - a.at : (a, b) => b.at - a.at);
      return res.end(JSON.stringify({ ok: true, list: l.slice(0, n).map(repPublic) }));
    }
    if (req.method !== "POST") { res.statusCode = 405; return res.end("{}"); }
    // (sent in: a few an hour from anyone, and no bigger than a long battle makes)
    const ip = (req.socket && req.socket.remoteAddress) || "x", t = now(), recent = (repAsks.get(ip) || []).filter(x => t - x < 600000);
    if (recent.length >= 12) { res.statusCode = 429; return res.end(JSON.stringify({ error: "too many" })); }
    recent.push(t); repAsks.set(ip, recent);
    const parts = []; let size = 0, over = false;
    req.on("data", c => { size += c.length; if (size > REP_MAX) { over = true; req.destroy(); } else parts.push(c); });
    req.on("end", () => {
      if (over) return;
      const buf = Buffer.concat(parts);
      zlib.gunzip(buf, { maxOutputLength: REP_RAW }, (e, raw) => {
        let R0 = null; try { if (!e) R0 = JSON.parse(raw.toString("utf8")); } catch (er) {}
        const M = R0 && R0.meta;
        if (!M || R0.v !== 1 || !Array.isArray(R0.frames) || !Array.isArray(R0.ev) || !Array.isArray(R0.roster) || !R0.setup) { res.statusCode = 400; return res.end(JSON.stringify({ error: "not a replay" })); }
        const token = String(req.headers["x-token"] || ""), id = crypto.randomBytes(6).toString("hex");
        const r = { id, at: now(), pid: token.length >= 16 ? pidOf(token) : "", name: clean(M.name, 24) || "Stranger", foe: clean(M.foe, 48), kind: ["battle", "skirmish", "duel"].includes(M.kind) ? M.kind : "battle", vs: M.vs === "player" ? "player" : "bots",
          place: clean(M.place, 48), hour: clean(M.hour, 12), won: !!M.won, k: Math.max(0, num(M.k) | 0), l: Math.max(0, num(M.l) | 0), secs: Math.max(0, Math.min(7200, Math.round(num(M.secs)))), score: Math.max(0, Math.min(999, Math.round(num(M.score)))),
          uni: Array.isArray(M.uni) ? M.uni.slice(0, 2).map(x => clean(x, 20)) : [], men: Array.isArray(M.men) ? M.men.slice(0, 2).map(x => Math.max(0, num(x) | 0)) : [], hl: Math.max(0, Math.min(40, num(M.hl) | 0)) };
        const done = () => { repIndex.push(r); repPrune(); repSave(); log(`replay ${id}: ${r.name} vs ${r.foe || "?"} (${r.kind}, ${r.secs}s, ${(buf.length / 1024).toFixed(0)} KB)`); res.end(JSON.stringify({ ok: true, id })); };
        if (!repDir) { repMem.set(id, buf); return done(); }
        fs.mkdir(repDir, { recursive: true }, () => fs.writeFile(repFile(id), buf, er => { if (er) { res.statusCode = 500; return res.end(JSON.stringify({ error: "couldn't keep it" })); } done(); }));
      });
    });
  }
  // (passed on as it is: activate a key on a machine, or check a key already activated; a few a minute from anyone)
  const licAsks = new Map();
  const shop = require("./shop.cjs")({ dataDir, envFile: opts.shopEnv || (dataDir ? path.join(dataDir, "stripe.env") : null), log });
  function licence(u, res, req) {
    const op = u.searchParams.get("op"), key = String(u.searchParams.get("key") || "").slice(0, 80), inst = String(u.searchParams.get("inst") || "").slice(0, 80), name = String(u.searchParams.get("name") || "Forester Reckoning").slice(0, 60);
    if (!["activate", "validate", "deactivate"].includes(op) || !/^[A-Za-z0-9-]{8,80}$/.test(key)) { res.statusCode = 400; return res.end(JSON.stringify({ error: "bad request" })); }
    const ip = (req.socket && req.socket.remoteAddress) || "x", t = now(), recent = (licAsks.get(ip) || []).filter(x => t - x < 60000);
    if (recent.length > 10) { res.statusCode = 429; return res.end(JSON.stringify({ error: "too many" })); }
    recent.push(t); licAsks.set(ip, recent);
    // (one of the shop's own keys: answered here)
    if (/^FR-/i.test(key)) { shop.licence(op, key, inst, name).then(j => { res.statusCode = j ? 200 : 400; res.end(JSON.stringify(j || { error: "bad request" })); }).catch(() => { res.statusCode = 502; res.end(JSON.stringify({ error: "shop unreachable" })); }); return; }
    const body = new URLSearchParams(op === "activate" ? { license_key: key, instance_name: name } : { license_key: key, instance_id: inst }).toString();
    const rq = require("https").request({ host: "api.lemonsqueezy.com", path: `/v1/licenses/${op}`, method: "POST", headers: { Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded", "Content-Length": Buffer.byteLength(body) }, timeout: 10000 }, r => {
      let d = ""; r.on("data", c => d += c); r.on("end", () => { res.statusCode = r.statusCode || 502; res.end(d || "{}"); });
    });
    rq.on("error", () => { res.statusCode = 502; res.end(JSON.stringify({ error: "shop unreachable" })); });
    rq.on("timeout", () => rq.destroy());
    rq.end(body);
  }
  // ---- the duel: those looking for a fight, paired off (nearest in rating first); each pair's fight passed between them ----
  // The server keeps the score and the rounds; where each is, what they fire and what lands, it only passes on.
  // the camp: its talk (the last of it, for whoever comes in), and the best commanders (kept on disk, if there's a disk)
  const campTalk = [];
  // (the second season's board: every rating begun again — the first's board.json left as it was, unread; and a game
  //  from before the new season, still counting its battles against bots, kept off it)
  const boardFile = dataDir ? path.join(dataDir, "board-2.json") : null;
  let boardMap = {}; try { if (boardFile && fs.existsSync(boardFile)) boardMap = JSON.parse(fs.readFileSync(boardFile, "utf8")) || {}; } catch (e) { boardMap = {}; }
  let boardSaveT = null;
  const boardSeen = c => {
    const k = c.user || c.pid; if (!k) return;
    boardMap[k] = { name: c.name, user: c.user, pid: c.pid, rating: c.rating, rank: c.rank, w: c.w, l: c.l, at: now() };
    if (boardFile && !boardSaveT) boardSaveT = setTimeout(() => { boardSaveT = null; try { fs.writeFileSync(boardFile, JSON.stringify(boardMap)); } catch (e) {} }, 5000);
  };
  // (with how many of each one's battles there are to watch)
  const boardTop = () => Object.values(boardMap).filter(b => (b.w + b.l) > 0).sort((a, b) => b.rating - a.rating).slice(0, 15).map(b => ({ ...b, reps: b.pid ? repIndex.filter(r => r.pid === b.pid).length : 0 }));
  // who's in the camp, and what each is about: told to everyone there (a moment after it changes, all at once)
  let campT = null;
  const campChanged = () => {
    if (campT) return;
    campT = setTimeout(() => {
      campT = null;
      const list = [...socks].filter(o => o.camp && o.open).map(o => ({ ...o.camp, status: o.duel ? (o.duel.battle ? "battle" : "duel") : pvpQ.some(q => q.ws === o) ? "looking" : o.camp.status }));
      for (const o of socks) if (o.camp && o.open) o.send({ t: "campers", list, board: boardTop() });
    }, 250);
  };
  const pvpQ = [];
  const unqueue = ws => { const i = pvpQ.findIndex(q => q.ws === ws); if (i >= 0) pvpQ.splice(i, 1); };
  const LOK = { long: ["musket", "bow", "crossbow"], side: ["pistol", "none"], blade: ["sword", "battleaxe", "spear", "axe", "dagger"] };
  const cleanLo = l => { const o = {}; for (const k in LOK) o[k] = LOK[k].includes(l && l[k]) ? l[k] : LOK[k][0]; return o; };
  const duelSend = (d, i, m) => { const ws = d.p[i]; if (ws && ws.open) ws.send(m); };
  function pair(a, b) {
    const d = { id: crypto.randomBytes(4).toString("hex"), p: [a.ws, b.ws], who: [a, b], wins: [0, 0], round: 1, hp: [100, 100], start: now() + 4000, decided: false, over: false, battle: a.mode === "battle" };
    a.ws.duel = d; b.ws.duel = d; a.ws.side = 0; b.ws.side = 1;
    const pub = q => ({ name: q.who.name, user: q.who.user, look: q.who.look, lo: q.lo, rating: q.rating, army: q.army });
    // (a battle: each player's company as they set it; the first of the two keeps the field and its men — the host)
    duelSend(d, 0, { t: "duel", id: d.id, side: 0, foe: pub(b), battle: d.battle, army: a.army });
    duelSend(d, 1, { t: "duel", id: d.id, side: 1, foe: pub(a), battle: d.battle, army: b.army });
    log(`a ${d.battle ? "battle" : "duel"}: ${a.who.name} against ${b.who.name}`); campChanged();
  }
  function duelEnd(d, winner, left = false) {
    if (d.over) return; d.over = true;
    for (let i = 0; i < 2; i++) { duelSend(d, i, { t: "dend", winner, left }); if (d.p[i]) { d.p[i].duel = null; } }
    campChanged();
  }
  function roundTo(d, winner) {
    if (d.decided || d.over) return; d.decided = true;
    if (winner >= 0) d.wins[winner]++;
    for (let i = 0; i < 2; i++) duelSend(d, i, { t: "dround", r: d.round, winner, wins: d.wins });
    if (winner >= 0 && d.wins[winner] >= 2) { setTimeout(() => duelEnd(d, winner), 3300); return; }
    setTimeout(() => { if (d.over) return; d.round++; d.decided = false; d.hp = [100, 100]; d.start = now() + 4000; for (let i = 0; i < 2; i++) duelSend(d, i, { t: "dstart", r: d.round }); }, 3300);
  }
  function duelMsg(ws, m, raw) {
    const d = ws.duel, me = ws.side, them = 1 - me; if (!d || d.over) return;
    const relay = o => duelSend(d, them, o);
    // a battle's own word between the two games — the field, the men on it, the shots, the orders: passed on as it is
    // (the host's game keeps the battle; this server only carries it), within reason as to size
    if (d.battle && /^b[a-z]{1,10}$/.test(m.t) && raw.length < 60000) return relay(m);
    if (d.battle && m.t === "ddown") return;
    switch (m.t) {
      case "ds": return relay({ t: "ds", x: num(m.x), z: num(m.z), yaw: num(m.yaw), s: num(m.s), h: String(m.h || "").slice(0, 12), aim: m.aim ? 1 : 0, g: m.g ? 1 : 0, c: m.c ? 1 : 0, dn: m.dn ? 1 : 0, ld: Math.max(0, Math.min(10, num(m.ld))) });
      case "dfire": return relay({ t: "dfire", k: String(m.k || "").slice(0, 10), p: num(m.p, 1), f: (m.f || []).slice(0, 3).map(v => num(v)), d: (m.d || []).slice(0, 3).map(v => num(v)) });
      case "dwind": return relay({ t: "dwind", dir: ["up", "left", "right"].includes(m.dir) ? m.dir : "right" });
      case "dswing": return relay({ t: "dswing", dir: ["up", "left", "right"].includes(m.dir) ? m.dir : "right", dmg: Math.max(0, Math.min(30, num(m.dmg))), reach: Math.max(1, Math.min(3.2, num(m.reach, 2.4))) });
      case "dres": return relay({ t: "dres", how: String(m.how || "").slice(0, 8) });
      case "dhit": return relay({ t: "dhit", dmg: Math.max(0, Math.min(130, num(m.dmg))), head: !!m.head });
      case "dhp": d.hp[me] = Math.max(0, Math.min(100, num(m.hp, 100))); return relay({ t: "dhp", hp: d.hp[me] });
      case "ddown": if ((m.r | 0) === d.round) roundTo(d, them); return;
      case "dleave": duelEnd(d, them, true); return;
    }
  }
  // (a round runs two and a half minutes; then whoever's least hurt has it)
  const ivDuel = setInterval(() => {
    const seen = new Set();
    for (const ws of socks) { const d = ws.duel; if (!d || seen.has(d) || d.over || d.decided || d.battle) continue; seen.add(d); if (now() - d.start > 150000) roundTo(d, d.hp[0] > d.hp[1] ? 0 : d.hp[1] > d.hp[0] ? 1 : -1); }
    // (anyone waiting too long is told no one came — the game then finds them a bot)
    for (let i = pvpQ.length - 1; i >= 0; i--) if (!pvpQ[i].ws.open) pvpQ.splice(i, 1);
  }, 1000);
  const socks = new Set();
  server.on("upgrade", (req, socket) => {
    const ws = upgrade(req, socket); if (!ws) return;
    socks.add(ws);
    let who = null;
    ws.onclose = () => { socks.delete(ws); unqueue(ws); if (ws.camp) { ws.camp = null; campChanged(); } if (ws.duel) { const d = ws.duel; duelEnd(d, 1 - ws.side, true); } if (ws.player) ws.player.room.leave(ws.player); };
    ws.onmessage = text => {
      let m; try { m = JSON.parse(text); } catch (e) { return; }
      if (!m || typeof m.t !== "string") return;
      if (m.t === "hello") {
        if ((m.v | 0) !== R.PROTOCOL) return ws.send({ t: "err", fatal: true, text: "This server runs a different version of the game. Update the game, or wait for the server to be." });
        const token = String(m.token || ""); if (token.length < 16) return ws.close();
        // (the username is who you are, and stays; the name is who you play this time — invitations go by the username)
        who = { pid: pidOf(token), user: userOf(m.user), name: clean(m.name, 24) || "Stranger", look: sanitizeLook(m.look) }; ws.who = who;
        return ws.send({ t: "hi", pid: who.pid, server: stats() });
      }
      if (!who) return;
      if (m.t === "rooms") return ws.send({ t: "rooms", rooms: list(who), server: stats() });
      // the duel: looking for a fight (paired with whoever else is, nearest your rating), or no longer
      if (m.t === "pvpq") {
        unqueue(ws); if (ws.duel) return;
        const mode = m.mode === "battle" ? "battle" : "duel";
        const A = m.army || {}, M = A.muster && typeof A.muster === "object" ? A.muster : {}, muster = {};
        for (const k of Object.keys(M).slice(0, 12)) if (/^[a-z]{1,12}$/.test(k)) muster[k] = Math.max(0, Math.min(30, M[k] | 0));
        const army = mode === "battle" ? { allies: Math.max(0, Math.min(30, A.allies | 0)), ground: ["open", "ours", "theirs"].includes(A.ground) ? A.ground : "open", uniform: String(A.uniform || "").slice(0, 20), muster, guns: Math.max(0, Math.min(3, A.guns | 0)) } : null;
        const me = { ws, who: { ...who }, lo: cleanLo(m.lo), rating: Math.max(0, Math.min(4000, num(m.rating, 1000))), at: now(), mode, army };
        if (m.user) me.who.user = userOf(m.user);
        let best = -1, bd = Infinity;
        pvpQ.forEach((q, i) => { if (q.who.pid === who.pid || !q.ws.open || q.mode !== mode) return; const dd = Math.abs(q.rating - me.rating); if (dd < bd) { bd = dd; best = i; } });
        if (best >= 0) { const q = pvpQ.splice(best, 1)[0]; return pair(q, me); }
        pvpQ.push(me); campChanged(); return;
      }
      if (m.t === "pvpcancel") { unqueue(ws); campChanged(); return; }
      // ---- the camp: everyone in the To Arms menus — who's there, the talk, challenges, the best commanders ----
      if (m.t === "camp") {
        ws.camp = { pid: who.pid, name: who.name, user: who.user, rating: Math.max(0, Math.min(4000, Math.round(num(m.rating, 1000)))), rank: clean(m.rank, 24), w: Math.max(0, num(m.w) | 0), l: Math.max(0, num(m.l) | 0), status: ["camp", "looking", "mustering"].includes(m.status) ? m.status : "camp" };
        if (num(m.season, 1) >= 2) boardSeen(ws.camp); campChanged();
        if (!ws.campTold) { ws.campTold = true; ws.send({ t: "said", list: campTalk.slice(-40) }); }
        ws.send({ t: "board", list: boardTop() });
        return;
      }
      if (m.t === "uncamp") { ws.camp = null; campChanged(); return; }
      if (m.t === "say") {
        if (!ws.camp) return;
        const text = clean(m.text, 200); if (!text) return;
        // (a word now and then: no one fills the camp with it)
        const t = now(); ws.sayT = (ws.sayT || []).filter(x => t - x < 10000); if (ws.sayT.length >= 5) return ws.send({ t: "said", msg: { name: "", text: "Slow down a little — a word at a time.", at: t, sys: true } }); ws.sayT.push(t);
        const msg = { name: who.name, user: who.user, text, at: t }; campTalk.push(msg); if (campTalk.length > 80) campTalk.shift();
        for (const o of socks) if (o.camp && o.open) o.send({ t: "said", msg });
        return;
      }
      if (m.t === "challenge") {
        if (!ws.camp || ws.duel) return;
        const to = [...socks].find(o => o.camp && o.camp.pid === m.to && o !== ws);
        if (!to || to.duel) return ws.send({ t: "declined", name: to ? to.camp.name : "", why: "busy" });
        to.challenge = { from: ws, mode: m.mode === "duel" ? "duel" : "battle", at: now() };
        to.send({ t: "challenged", from: who.pid, name: who.name, rating: ws.camp.rating, mode: to.challenge.mode });
        return;
      }
      if (m.t === "answer") {
        const ch = ws.challenge; ws.challenge = null; if (!ch || now() - ch.at > 60000) return;
        const from = ch.from; if (!from.open || from.duel || ws.duel) return ws.send({ t: "declined", name: from.camp ? from.camp.name : "", why: "gone" });
        if (!m.yes) return from.send({ t: "declined", name: who.name, why: "no" });
        unqueue(from); unqueue(ws);
        const q = o => ({ ws: o, who: { ...o.who }, lo: cleanLo(null), rating: o.camp ? o.camp.rating : 1000, at: now(), mode: ch.mode, army: ch.mode === "battle" ? { allies: 0, ground: "open", uniform: "", muster: {}, guns: 0 } : null });
        return pair(q(from), q(ws));
      }
      if (ws.duel) return duelMsg(ws, m, text);
      if (m.t === "host") {
        if (rooms.size > 200) return ws.send({ t: "err", text: "This server has as many games as it can hold." });
    // (meta for the lobby: a colony lists without being joinable once ended)
        const r = new Room({ name: m.name, mode: m.mode, max: m.max, kind: m.kind, size: m.size, password: m.password, host: who.name, hostUser: who.user, seed: m.seed, hostPid: who.pid, private: !!m.private, invite: m.invite });
        rooms.set(r.id, r); log(`hosted "${r.name}" (${r.mode}, ${r.kind}, ${r.size}) by ${who.name}`);
        if (ws.player) ws.player.room.leave(ws.player);
        return r.join(ws, who, r.password);
      }
      if (m.t === "join") {
        const r = rooms.get(String(m.room || "")); if (!r || r.ended) return ws.send({ t: "err", text: "That game has ended." });
        if (ws.player) ws.player.room.leave(ws.player);
        who.look = sanitizeLook(m.look || who.look); who.name = clean(m.name, 24) || who.name;
        return r.join(ws, who, m.password ? String(m.password) : "");
      }
      if (m.t === "leave") { if (ws.player) ws.player.room.leave(ws.player); return; }
      if (ws.player) ws.player.room.on(ws.player, m);
    };
  });
  const iv1 = setInterval(() => { for (const r of rooms.values()) r.tick(); }, 100);
  const iv2 = setInterval(() => {
    for (const r of rooms.values()) r.slow();
    // a game left empty is ended after ten minutes (time enough to come back to it)
    for (const [id, r] of rooms) if (!r.persistent && !r.online.size && r.emptySince && (r.ended || now() - r.emptySince > (r.private && r.invited.size ? 12 * 3600 * 1000 : 10 * 60 * 1000))) { rooms.delete(id); log(`"${r.name}" ended`); }
  }, 3000);
  const iv3 = setInterval(saveWorld, 20000);
  await new Promise((ok, no) => { server.once("error", no); server.listen(opts.port ?? 47810, opts.host || "0.0.0.0", ok); });
  const port = server.address().port;
  log(`${name}: listening on ${port}${world ? " (with the wide world)" : ""}`);
  // on your own network: called out every couple of seconds, so other copies of the game find it
  let beacon = null, biv = null;
  if (opts.lan) {
    beacon = dgram.createSocket({ type: "udp4", reuseAddr: true });
    beacon.bind(() => { try { beacon.setBroadcast(true); } catch (e) {} });
    const shout = () => { const msg = Buffer.from(JSON.stringify({ reckoning: R.PROTOCOL, name, port, rooms: [...rooms.values()].filter(r => !r.ended && !r.persistent).map(r => ({ ...r.meta(), ...(r.private ? { inv: [...r.invited, r.hostPid] } : {}) })) })); for (const a of broadcastAddrs()) beacon.send(msg, LAN_PORT, a, () => {}); };
    biv = setInterval(shout, 2000); setTimeout(shout, 100);
  }
  const stop = () => new Promise(ok => {
    clearInterval(iv1); clearInterval(iv2); clearInterval(iv3); clearInterval(ivDuel); if (biv) clearInterval(biv); if (beacon) try { beacon.close(); } catch (e) {}
    saveWorld(); for (const s of socks) s.close(); server.close(() => ok());
    setTimeout(ok, 1500);
  });
  return { port, stop, rooms, stats, name };
}
// a look, from a player: only colours and a few words, nothing else passed on
function sanitizeLook(l) {
  const o = {}; if (!l || typeof l !== "object") return o;
  for (const k of ["skin", "hair", "coat", "legs", "vest", "apron", "hatColor", "sash", "eyes", "linen", "stockings"]) if (Number.isFinite(+l[k]) && l[k] !== null && l[k] !== "") o[k] = (+l[k]) & 0xffffff;
  o.body = LK.BODIES.some(b => b.id === l.body) ? l.body : "townsman";
  o.sex = LK.isF(o) ? "f" : "m";
  o.hat = LK.HAT_STYLES.some(h => h.id === l.hat) ? l.hat : "hat";
  o.height = Math.max(0.92, Math.min(1.08, num(l.height, 1)));
  o.build = Math.max(0.88, Math.min(1.14, num(l.build, 1)));
  o.head = Math.max(0.92, Math.min(1.08, num(l.head, 1)));
  o.seed = num(l.seed, 1) | 0;
  return o;
}
function broadcastAddrs() {
  const out = new Set(["255.255.255.255"]);
  for (const list of Object.values(os.networkInterfaces())) for (const a of list || []) {
    if (a.family !== "IPv4" || a.internal) continue;
    const ip = a.address.split(".").map(Number), mk = a.netmask.split(".").map(Number);
    out.add(ip.map((b, i) => (b & mk[i]) | (~mk[i] & 255)).join("."));
  }
  return [...out];
}
// listening for games on your own network: calls back with {address, port, name, rooms} as each is heard
function discover(cb) {
  const s = dgram.createSocket({ type: "udp4", reuseAddr: true });
  s.on("message", (buf, from) => { try { const m = JSON.parse(buf.toString()); if (m && m.reckoning) cb({ address: from.address, port: m.port, name: m.name, rooms: m.rooms || [], at: Date.now() }); } catch (e) {} });
  s.on("error", () => {});
  s.bind(LAN_PORT);
  return () => { try { s.close(); } catch (e) {} };
}
function lanAddresses() {
  const out = [];
  for (const list of Object.values(os.networkInterfaces())) for (const a of list || []) if (a.family === "IPv4" && !a.internal) out.push(a.address);
  return out;
}

module.exports = { start, discover, lanAddresses };

// run on its own
if (require.main === module) {
  const arg = (k, d) => { const i = process.argv.indexOf("--" + k); return i < 0 ? d : (process.argv[i + 1] && !process.argv[i + 1].startsWith("--") ? process.argv[i + 1] : true); };
  start({ port: +(arg("port", process.env.PORT || 8080)), world: !!arg("world", false), data: arg("data", "./world-data"), name: arg("name", ""), lan: !!arg("lan", false), seed: arg("seed") ? +arg("seed") : undefined, stock: arg("stock") ? +arg("stock") : 0, hour: arg("hour") ? +arg("hour") : undefined })
    .then(s => { const bye = () => s.stop().then(() => process.exit(0)); process.on("SIGINT", bye); process.on("SIGTERM", bye); })
    .catch(e => { console.error(e); process.exit(1); });
}
