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

let R = null, T = null, LK = null;
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
  deliver(data) { if (process.env.MP_DEBUG && data.length > 100000) console.log(`big message ${data.length}`); if (this.onmessage) this.onmessage(data.toString("utf8")); }
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
const clean = (s, n) => String(s == null ? "" : s).replace(/[\u0000-\u001f<>]/g, "").trim().slice(0, n);
const num = (v, d = 0) => (Number.isFinite(+v) ? +v : d);
const now = () => Date.now();

class Room {
  constructor(o) {
    this.id = o.id || crypto.randomBytes(4).toString("hex");
    this.name = clean(o.name, 40) || "A game in the woods";
    this.mode = R.MODES[o.mode] || o.mode === "colony" || o.mode === "nations" ? o.mode : "coop";
    this.hostPid = o.hostPid || null;        // (a colony game: the one whose game it is, and runs it)
    this.max = Math.max(2, Math.min(o.persistent ? 500 : 16, num(o.max, 8) | 0));
    this.kind = T.TERRAINS[o.kind] ? o.kind : "island";
    this.size = R.SIZES[o.size] ? o.size : "m";
    this.half = o.half || R.SIZES[this.size];
    if (this.kind === "earth") this.half = Math.max(this.half, 2400);        // (the whole world wants room to be seen)
    this.seed = num(o.seed, crypto.randomInt(1, 2 ** 31 - 1)) | 0;
    this.persistent = !!o.persistent;
    this.password = o.password ? String(o.password).slice(0, 40) : "";
    this.host = clean(o.host, 24);
    this.created = now(); this.emptySince = now();
    this.land = T.makeTerrain(this.seed, this.half, this.kind);
    this.online = new Map();           // pid → {sock, pid, name, look, x, y, z, yaw, a, h, hp, dead, ...}
    this.recs = {};                    // pid → {name, look, wood, stone, home, kills, deaths, seen, group}
    this.felled = {}; this.broken = {}; // id → when it grows back
    this.hits = new Map();             // a tree or a rock part-way through: id → blows so far
    this.buildings = {};
    this.groups = {};                  // group id → {name, members: [pid]}
    this.invites = new Map();          // invited pid → {from, at}
    this.chat = [];
    this.nextB = 1;
    this.day0 = now() - R.DAY_MS * (START && START.hour != null ? START.hour : 0.3);   // (in the morning, in fact)
    this.spawnAt = this.land.findHome(T.seq(this.seed ^ 0x5eed), [], 0);
    this.shared = { ...(START || R.START_STOCK) };   // (co-op: one colony, one store)
    this.settlers = {}; this.nextS = 1; this.lastArrive = {}; this.workCache = {};
    this.wars = []; this.news = []; this.lastWar = {};
    this.drops = {}; this.nextD = 1;     // (what the fallen dropped: a sack each, for anyone to loot, a few minutes)
    // Classic: a nation each, each the real game on its owner's computer; here only what passes between them
    this.nats = {}; this.pacts = new Set(); this.nwars = []; this.offers = new Map(); this.forays = new Map(); this.peaceAsk = new Map(); this.pactAsk = new Map(); this.lastNWar = {}; this.nextO = 1;
    this.dirty = false;
  }
  storeOf(pid) { return this.mode === "coop" ? this.shared : this.recs[pid]; }
  meta() {
    return { id: this.id, name: this.name, mode: this.mode, kind: this.mode === "colony" || this.mode === "nations" ? "woods" : this.kind, size: this.size, half: this.half, players: this.online.size, max: this.max, host: this.host, locked: !!this.password, persistent: this.persistent };
  }
  // ---- saving the wide world ----
  toJSON() { return { news: this.news.slice(-60), settlers: Object.fromEntries(Object.entries(this.settlers).map(([k, v]) => [k, { id: v.id, owner: v.owner, name: v.name, look: v.look, job: v.job, x: v.x, z: v.z, hp: v.hp }])), nextS: this.nextS, shared: this.shared, id: this.id, name: this.name, mode: this.mode, kind: this.kind, half: this.half, seed: this.seed, max: this.max, persistent: true, recs: this.recs, felled: this.felled, broken: this.broken, buildings: this.buildings, groups: this.groups, nextB: this.nextB, day0: this.day0 }; }
  static from(j) {
    const r = new Room(j);
    Object.assign(r, { news: j.news || [], settlers: Object.fromEntries(Object.entries(j.settlers || {}).map(([k, v]) => [k, { ...v, state: "find", a: "idle", yaw: 0, s: 0 }])), nextS: j.nextS || 1, shared: j.shared || r.shared, recs: j.recs || {}, felled: j.felled || {}, broken: j.broken || {}, buildings: j.buildings || {}, groups: j.groups || {}, nextB: j.nextB || 1, day0: j.day0 || r.day0 });
    return r;
  }
  each(f) { for (const p of this.online.values()) f(p); }
  all(msg, except) { const s = JSON.stringify(msg); for (const p of this.online.values()) if (p !== except) p.sock.send(s); }
  pub(p) { const r = this.recs[p.pid]; return { pid: p.pid, name: p.name, look: p.look, x: p.x, y: p.y, z: p.z, yaw: p.yaw, hp: p.hp, dead: p.dead, group: r && r.group || null }; }
  // ---- who may hurt whom ----
  allied(a, b) {
    if (a === b) return true;
    if (this.mode === "coop") return true;
    const ga = this.recs[a] && this.recs[a].group, gb = this.recs[b] && this.recs[b].group;
    return !!ga && ga === gb;
  }
  // the ground someone has claimed with a hearth, at a point (or null)
  claimAt(x, z) {
    for (const b of Object.values(this.buildings)) {
      const d = R.BUILD[b.type]; if (!d || !d.claim) continue;
      if (Math.hypot(b.x - x, b.z - z) < d.claim) return b;
    }
    return null;
  }
  join(sock, who, password) {
    if (this.password && password !== this.password) return sock.send({ t: "err", text: "That game has a password, and that wasn't it." });
    if (this.online.has(who.pid)) { const old = this.online.get(who.pid); old.sock.send({ t: "err", text: "You've joined from somewhere else." }); this.leave(old); }
    if (this.online.size >= this.max) return sock.send({ t: "err", text: "That game is full." });
    let rec = this.recs[who.pid];
    if (!rec) rec = this.recs[who.pid] = { name: who.name, look: who.look, ...(START || R.START_STOCK), home: null, kills: 0, deaths: 0, group: null, first: now() };
    rec.name = who.name; rec.look = who.look; rec.seen = now(); rec.food ??= R.START_STOCK.food; this.shared.food ??= R.START_STOCK.food;
    // where you come in: your hearth if it still stands; else (in a game among friends) beside the others, or
    // (in a fight, and the wide world) somewhere of your own, well away from everyone
    const hearth = Object.values(this.buildings).find(b => b.type === "hearth" && (b.owner === who.pid || this.mode === "coop"));
    let at;
    if (hearth) at = { x: hearth.x + 3, z: hearth.z + 3 };
    else if (this.mode === "coop" && !this.persistent) at = this.land.findHome(T.seq(crypto.randomInt(1, 1e9)), [], 0, this.spawnAt, 30);
    else at = this.land.findHome(T.seq(crypto.randomInt(1, 1e9)), Object.values(this.buildings).filter(b => b.type === "hearth").concat([...this.online.values()]), this.persistent ? 260 : 120);
    const p = { sock, pid: who.pid, name: who.name, look: who.look, x: at.x, y: this.land.heightAt(at.x, at.z), z: at.z, yaw: 0, a: "idle", h: "axe", s: 0, hp: R.MAX_HP, dead: false, shield: now() + R.SPAWN_SHIELD_MS, lastBlow: 0, lastHit: 0, room: this };
    this.online.set(p.pid, p); sock.player = p; this.emptySince = 0;
    const live = (o, t) => Object.keys(o).filter(k => o[k] > t);
    const t = now();
    sock.send({ t: "in", room: { ...this.meta(), seed: this.seed }, you: { pid: p.pid, x: p.x, z: p.z, wood: this.storeOf(p.pid).wood, stone: this.storeOf(p.pid).stone, food: this.storeOf(p.pid).food | 0, shield: R.SPAWN_SHIELD_MS, home: hearth ? hearth.id : null },
      players: [...this.online.values()].filter(q => q !== p).map(q => this.pub(q)), felled: live(this.felled, t), broken: live(this.broken, t),
      buildings: Object.values(this.buildings), drops: Object.values(this.drops), settlers: Object.values(this.settlers).map(x => this.pubS(x)), wars: this.wars, news: this.news.slice(-30), groups: this.groups, day: { t: (t - this.day0) % R.DAY_MS, len: R.DAY_MS }, chat: this.chat.slice(-20),
      online: this.onlineNames(), ...(this.mode === "nations" ? this.natState() : {}) });
    this.all({ t: "pj", p: this.pub(p) }, p);
    if (process.env.MP_DEBUG) console.log(`join ${this.id} ${p.name} ${p.pid} host=${this.hostPid}`);
    this.note(`${p.name} has come.`, p);
    this.dirty = true;
  }
  onlineNames() { return [...this.online.values()].map(q => q.pid); }
  leave(p) {
    if (!this.online.has(p.pid) || this.online.get(p.pid) !== p) return;
    this.online.delete(p.pid); p.sock.player = null;
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
  stock(p) {
    // (a co-op colony's store is everyone's: all are told)
    if (this.mode === "coop") { this.all({ t: "stock", wood: this.shared.wood, stone: this.shared.stone, food: this.shared.food | 0 }); return; }
    const r = this.recs[p.pid]; p.sock.send({ t: "stock", wood: r.wood, stone: r.stone, food: r.food | 0 });
  }
  near(p, x, z, d) { return Math.hypot(p.x - x, p.z - z) <= d; }
  // ---- what players do ----
  on(p, m) {
    const rec = this.recs[p.pid], st = this.storeOf(p.pid), t = now();
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
        p.x = x; p.y = num(m.y, p.y); p.z = z; p.yaw = num(m.yaw, 0); p.a = clean(m.a, 12) || "idle"; p.h = clean(m.h, 10); p.s = num(m.s, 0); p.g = !!m.g;
        p.moved = true;
        return;
      }
      case "chop": {
        if (p.dead || t - p.lastBlow < 300) return; p.lastBlow = t;
        const tr = this.land.treeById(String(m.id || ""));
        if (!tr || this.felled[tr.id] > t || !this.near(p, tr.x, tr.z, R.REACH + 1)) return;
        const forge = this.hasForge(p.pid);
        const n = (this.hits.get(tr.id) || 0) + (forge ? 1.5 : 1);
        if (n < R.TREE_HITS[tr.kind]) { this.hits.set(tr.id, n); this.all({ t: "chip", id: tr.id, by: p.pid }, p); return; }
        this.hits.delete(tr.id);
        this.felled[tr.id] = t + R.REGROW_MS;
        const dx = tr.x - p.x, dz = tr.z - p.z, l = Math.hypot(dx, dz) || 1;
        st.wood += R.LOGS_PER_TREE[tr.kind];
        this.all({ t: "fell", id: tr.id, by: p.pid, dx: dx / l, dz: dz / l });
        this.stock(p); this.dirty = true;
        return;
      }
      case "mine": {
        if (p.dead || t - p.lastBlow < 300) return; p.lastBlow = t;
        const k = this.land.rockById(String(m.id || ""));
        if (!k || this.broken[k.id] > t || !this.near(p, k.x, k.z, R.REACH + k.s + 1)) return;
        const n = (this.hits.get(k.id) || 0) + (this.hasForge(p.pid) ? 1.5 : 1);
        if (n < R.ROCK_HITS) { this.hits.set(k.id, n); this.all({ t: "chip", id: k.id, by: p.pid }, p); return; }
        this.hits.delete(k.id);
        this.broken[k.id] = t + R.REGROW_MS;
        st.stone += R.STONE_PER_ROCK;
        this.all({ t: "rock", id: k.id, by: p.pid });
        this.stock(p); this.dirty = true;
        return;
      }
      case "build": {
        if (p.dead) return;
        const d = R.BUILD[m.type]; if (!d) return;
        const x = num(m.x), z = num(m.z), ry = num(m.ry);
        const no = text => p.sock.send({ t: "err", text });
        if (st.wood < d.wood || st.stone < d.stone) return no(`A ${d.name.toLowerCase()} takes ${d.wood} logs${d.stone ? ` and ${d.stone} stone` : ""}.`);
        if (!this.near(p, x, z, 16)) return no("Too far away to build there.");
        if (Math.abs(x) > this.half - 10 || Math.abs(z) > this.half - 10) return no("That's the edge of the map.");
        if (this.land.heightAt(x, z) < 0.6) return no("Not in the water.");
        if (m.type === "hearth" && Object.values(this.buildings).some(b => b.type === "hearth" && (b.owner === p.pid || this.mode === "coop"))) return no(this.mode === "coop" ? "The colony has its hearth already." : "You have a hearth already. Break it to move your homestead.");
        const claim = this.claimAt(x, z);
        if (claim && !this.allied(claim.owner, p.pid)) return no(`That's ${this.recs[claim.owner] ? this.recs[claim.owner].name + "'s" : "someone's"} ground.`);
        if (m.type === "hearth") for (const b of Object.values(this.buildings)) if (b.type === "hearth" && !this.allied(b.owner, p.pid) && Math.hypot(b.x - x, b.z - z) < d.claim + R.BUILD.hearth.claim) return no("Too near someone else's homestead.");
        for (const b of Object.values(this.buildings)) {
          const e = R.BUILD[b.type], gap = (d.wall && e.wall) ? 1.2 : (d.wall ? 0.3 : d.r) + (e.wall ? 0.3 : e.r) - 0.2;
          if (Math.hypot(b.x - x, b.z - z) < gap) return no("Something's in the way.");
        }
        st.wood -= d.wood; st.stone -= d.stone;
        const b = { id: "b" + (this.nextB++), type: m.type, x, z, ry, owner: p.pid, hp: d.hp, at: t };
        this.buildings[b.id] = b;
        this.all({ t: "b", b });
        this.stock(p); this.dirty = true;
        return;
      }
      case "hitb": {
        if (p.dead || t - p.lastBlow < 300) return; p.lastBlow = t;
        const b = this.buildings[m.id]; if (!b) return;
        const d = R.BUILD[b.type];
        if (!this.near(p, b.x, b.z, (d.wall ? d.len / 2 : d.r) + R.REACH + 1)) return;
        const no = text => p.sock.send({ t: "err", text });
        // your own: taken down, and most of it back
        if (b.owner === p.pid) {
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
        const q = this.online.get(String(m.pid || "")); if (!q || q.dead) return;
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
      case "unally": { if (rec.group) { const g = this.groups[rec.group]; this.quitGroup(p.pid); this.all({ t: "groups", groups: this.groups }); this.note(`${p.name} has left ${g ? g.name : "their alliance"}.`); this.dirty = true; } return; }
      case "give": {             // logs or stone handed to someone near
        const q = this.online.get(String(m.pid || "")); if (!q || q === p || !this.near(p, q.x, q.z, 6)) return;
        const w = Math.max(0, Math.min(st.wood, num(m.wood) | 0)), s = Math.max(0, Math.min(st.stone, num(m.stone) | 0));
        if (!w && !s) return;
        st.wood -= w; st.stone -= s; this.recs[q.pid].wood += w; this.recs[q.pid].stone += s;
        this.stock(p); this.stock(q);
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
        delete this.drops[d.id];
        st.wood += d.wood; st.stone += d.stone; st.food = (st.food || 0) + d.food;
        this.all({ t: "dropgone", id: d.id, by: p.pid, name: p.name, d });
        if (p.pid !== d.owner) this.note(`${p.name} has looted ${d.name}'s sack.`);
        if (d.wood + d.stone >= 20 && p.pid !== d.owner) this.headline("death", `${p.name} stripped ${d.name}'s body of ${d.wood} logs and ${d.stone} stone.`);
        this.stock(p); this.dirty = true;
        return;
      }
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
    if (kr && kr !== vr) {
      w = Math.floor(vr.wood / 3); s = Math.floor(vr.stone / 3); f = Math.floor((vr.food || 0) / 3);
      if (w || s || f) {
        vr.wood -= w; vr.stone -= s; vr.food = (vr.food || 0) - f;
        drop = { id: "d" + this.nextD++, x: q.x, z: q.z, wood: w, stone: s, food: f, name: q.name, owner: q.pid, at: t };
        this.drops[drop.id] = drop; this.all({ t: "drop", d: drop });
      }
    }
    void kr;
    if (this.recs[by]) this.recs[by].kills++; if (this.recs[q.pid]) this.recs[q.pid].deaths++;
    this.all({ t: "die", pid: q.pid, by, dropped: drop ? { wood: w, stone: s, food: f } : null });
    { const kn = this.online.get(by) ? this.online.get(by).name : this.settlers[by] ? `${this.settlers[by].name}, a watchman` : "someone"; this.headline("death", `${q.name} was struck down by ${kn}.`); }
    const ko = killer && this.online.get(killer); if (ko) this.stock(ko); this.stock(q); this.dirty = true;
    setTimeout(() => this.respawn(q), R.RESPAWN_MS);
    return true;
  }
  // ---- settlers ----
  dayFrac() { return (((now() - this.day0) % R.DAY_MS) + R.DAY_MS) % R.DAY_MS / R.DAY_MS; }
  isNight() { const f = this.dayFrac(); return f > 0.86 || f < 0.21; }
  ownerKey(pid) { return this.mode === "coop" ? "colony" : pid; }
  active(owner) { return owner === "colony" ? this.online.size > 0 : this.online.has(owner); }
  mineB(owner, b) { return owner === "colony" || b.owner === owner; }
  homeOf(owner) { return Object.values(this.buildings).find(b => b.type === "hearth" && this.mineB(owner, b)) || null; }
  bedsOf(owner) { let n = 0; for (const b of Object.values(this.buildings)) if (this.mineB(owner, b)) n += R.BUILD[b.type].beds || 0; return Math.min(n, R.SETTLER.max); }
  storeFor(owner) { return owner === "colony" ? this.shared : this.recs[owner]; }
  stockTo(owner) { if (owner === "colony") { this.all({ t: "stock", wood: this.shared.wood, stone: this.shared.stone, food: this.shared.food | 0 }); return; } const o = this.online.get(owner); if (o) this.stock(o); }
  tell(owner, text) { if (owner === "colony") this.note(text); else { const o = this.online.get(owner); if (o) o.sock.send({ t: "note", text }); } }
  pubS(v) { return { id: v.id, owner: v.owner, name: v.name, look: v.look, job: v.job, x: +v.x.toFixed(2), z: +v.z.toFixed(2), yaw: v.yaw || 0, a: v.a || "idle", hp: v.hp }; }
  // who comes, who goes, and who does what: every few seconds
  settle() {
    const t = now(), owners = new Set();
    for (const b of Object.values(this.buildings)) if (b.type === "hearth") owners.add(this.mode === "coop" ? "colony" : b.owner);
    for (const v of Object.values(this.settlers)) if (!owners.has(v.owner)) { delete this.settlers[v.id]; this.all({ t: "sx", id: v.id }); }   // (their hearth gone: they go)
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
        const a = Math.random() * 6.28, v = { id: "s" + (this.nextS++), owner, name: names[crypto.randomInt(0, names.length)], look, job: "wood", x: home.x + Math.cos(a) * 4, z: home.z + Math.sin(a) * 4, yaw: 0, a: "idle", s: 0, hp: R.SETTLER.hp, state: "find" };
        void f;
        this.settlers[v.id] = v;
        this.all({ t: "sj", s: this.pubS(v) });
        const o = owner === "colony" ? null : this.online.get(owner);
        const msg = `${v.name} has come to live ${owner === "colony" ? "in the colony" : "with you"}.`;
        { const count = Object.values(this.settlers).filter(x => x.owner === owner).length; if (count === 4 || count === 8 || count === 12) this.headline("grow", `${owner === "colony" ? "The colony" : (this.recs[owner] ? this.recs[owner].name + "'s homestead" : "A homestead")} has grown to ${count} settlers.`); }
        if (o) o.sock.send({ t: "note", text: msg }); else if (owner === "colony") this.note(msg);
        this.dirty = true;
      }
      // the work: a watch for every tower (two to each), a third at the stone if logs are plenty, the rest at the trees
      const now2 = Object.values(this.settlers).filter(v => v.owner === owner);
      const towers = Object.values(this.buildings).filter(b => b.type === "tower" && this.mineB(owner, b)).length;
      const st = this.storeFor(owner) || { wood: 0, stone: 0 };
      const fields = Object.values(this.buildings).filter(b => b.type === "field" && this.mineB(owner, b)).length;
      let watch = Math.min(now2.length, towers * R.SETTLER.guardsPerTower), farm = Math.min(now2.length - watch, fields), stoneN = st.wood > st.stone * 3 + 20 ? Math.floor((now2.length - watch - farm) / 3) : 0;
      for (const v of now2) {
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
        const f = fields[Number(v.id.slice(1)) % Math.max(1, fields.length)]; if (!f) { idle(); continue; }
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
  // the wars, every few seconds: who's at the hearth, and how far the taking of it has gone
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
        // taken: the hearth and everything on its ground, and everyone who lived there
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
        const n = { pid: me, ruler: p.name, nation: clean(m.nation, 40) || `${p.name}'s people`, pop: num(m.pop) | 0, day: num(m.day) | 0, coin: num(m.coin) | 0, watch: num(m.watch) | 0, built: num(m.built) | 0, known: num(m.known) | 0, at: t };
        this.nats[me] = n;
        if (was) for (const k of [10, 25, 50]) if (was.pop < k && n.pop >= k) this.headline("grow", `${n.nation} has grown to ${k} souls.`);
        if (!was || was.nation !== n.nation || was.pop !== n.pop || was.day !== n.day || was.watch !== n.watch) this.natPush();
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
        if ([...this.forays.values()].some(f => f.from === me)) return no("Your war party is still out.");
        const n = Math.max(1, Math.min(10, num(m.n) | 0)), id = "f" + this.nextO++;
        const lead = !!m.lead;
        this.forays.set(id, { id, from: me, to, n, at: t, lead, people: Array.isArray(m.people) ? m.people.slice(0, 10).map(x => clean(x, 40)) : [] });
        this.sendTo(to, { t: "raided", id, from: me, name: this.natName(me), n, lead, ruler: p.name, look: p.look });
        p.sock.send({ t: "foray", id, to });
        this.headline("war", lead ? `${p.name} of ${this.natName(me)} marches against ${this.natName(to)} at the head of ${n} armed men.` : `${this.natName(me)} has sent ${n} armed men against ${this.natName(to)}.`);
        return;
      }
      // a battle led in person: the defender's game shows it to the one leading the attack, and is told what they do
      case "bh": { const f = [...this.forays.values()].find(f => f.lead && f.to === me && f.from === to); if (f) this.sendTo(to, { t: "h", m: m.m }); return; }
      case "bg": { const f = [...this.forays.values()].find(f => f.lead && f.from === me && f.to === to); if (f) this.sendTo(to, { t: "g", from: me, m: m.m }); return; }
      case "raidEnd": {
        const f = this.forays.get(String(m.id)); if (!f || f.to !== me) return;
        this.forays.delete(f.id);
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
    for (const f of [...this.forays.values()]) if (f.to === pid) { this.forays.delete(f.id); this.sendTo(f.from, { t: "raidBack", id: f.id, n: f.n, down: 0, loot: {}, name: this.natName(pid), gone: true }); }
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
      if (this.mode !== "colony" && this.mode !== "nations") this.ai(0.2);
      const sm = [];
      for (const v of Object.values(this.settlers)) if (v.moved) { v.moved = false; sm.push([v.id, +v.x.toFixed(2), +v.z.toFixed(2), +v.yaw.toFixed(2), v.a, +(v.s || 0).toFixed(2)]); }
      if (sm.length) this.all({ t: "ss", l: sm });
    }
  }
  slow() {
    const t = now(), back = [], rocks = [];
    for (const [id, at] of Object.entries(this.felled)) if (at <= t) { delete this.felled[id]; back.push(id); }
    for (const [id, at] of Object.entries(this.broken)) if (at <= t) { delete this.broken[id]; rocks.push(id); }
    if (back.length || rocks.length) { this.all({ t: "grow", trees: back, rocks }); this.dirty = true; }
    if (this.mode !== "colony" && this.mode !== "nations") this.settle();
    if (this.wars.length) this.warTick(t);
    for (const w of this.nwars.slice()) if (t - w.start > R.WAR.lastsMs * 2) this.endNWar(w, `The war between ${w.aName} and ${w.bName} has burnt itself out. There's peace, of a kind.`);
    for (const [k, at] of this.invites) if (t - at > 120000) this.invites.delete(k);
    // a sack left lying a few minutes is gone (picked over, or the crows had it)
    for (const d of Object.values(this.drops)) if (t - d.at > 180000) { delete this.drops[d.id]; this.all({ t: "dropgone", id: d.id }); }
    // wounds mend, a while after the last blow
    for (const p of this.online.values()) if (!p.dead && p.hp < R.MAX_HP && t - (p.hurtAt || 0) > 8000) { p.hp = Math.min(R.MAX_HP, p.hp + 4); this.all({ t: "hp", pid: p.pid, hp: p.hp, heal: true }); }
  }
}

// ---------------------------------------------------------------------------
//  the server
// ---------------------------------------------------------------------------
async function start(opts = {}) {
  const base = pathToFileURL(path.join(__dirname, "..", "js", "mp") + path.sep).href;
  R = await import(base + "rules.js"); T = await import(base + "terrain.js"); LK = await import(base + "look.js");
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
    if (!world) world = new Room({ id: "world", name: "The Wide World", mode: "pvp", kind: "earth", max: 500, persistent: true, half: R.WORLD_HALF, seed: opts.seed });
    world.id = "world"; world.half = R.WORLD_HALF;
    rooms.set(world.id, world);
    log(`the wide world: seed ${world.seed}, ${Object.keys(world.recs).length} players known, ${Object.keys(world.buildings).length} buildings`);
  }
  const saveWorld = () => {
    if (!world || !dataDir || !world.dirty) return;
    world.dirty = false;
    try { fs.mkdirSync(dataDir, { recursive: true }); const f = path.join(dataDir, "world.json"); fs.writeFileSync(f + ".tmp", JSON.stringify(world)); fs.renameSync(f + ".tmp", f); }
    catch (e) { log("couldn't save the world:", e.message); }
  };
  const list = () => [...rooms.values()].filter(r => !r.ended).map(r => r.meta());
  const stats = () => ({ ok: true, name, protocol: R.PROTOCOL, world: !!world, games: rooms.size - (world ? 1 : 0), players: [...rooms.values()].reduce((a, r) => a + r.online.size, 0) });

  const server = http.createServer((req, res) => {
    const u = new URL(req.url, "http://x");
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Content-Type", "application/json");
    if (u.pathname === "/rooms") return res.end(JSON.stringify({ ...stats(), rooms: list() }));
    if (u.pathname === "/" || u.pathname === "/status") return res.end(JSON.stringify(stats()));
    res.statusCode = 404; res.end("{}");
  });
  const socks = new Set();
  server.on("upgrade", (req, socket) => {
    const ws = upgrade(req, socket); if (!ws) return;
    socks.add(ws);
    let who = null;
    ws.onclose = () => { socks.delete(ws); if (ws.player) ws.player.room.leave(ws.player); };
    ws.onmessage = text => {
      let m; try { m = JSON.parse(text); } catch (e) { return; }
      if (!m || typeof m.t !== "string") return;
      if (m.t === "hello") {
        if ((m.v | 0) !== R.PROTOCOL) return ws.send({ t: "err", fatal: true, text: "This server runs a different version of the game. Update the game, or wait for the server to be." });
        const token = String(m.token || ""); if (token.length < 16) return ws.close();
        who = { pid: pidOf(token), name: clean(m.name, 24) || "Stranger", look: sanitizeLook(m.look) };
        return ws.send({ t: "hi", pid: who.pid, server: stats() });
      }
      if (!who) return;
      if (m.t === "rooms") return ws.send({ t: "rooms", rooms: list(), server: stats() });
      if (m.t === "host") {
        if (rooms.size > 200) return ws.send({ t: "err", text: "This server has as many games as it can hold." });
    // (meta for the lobby: a colony lists without being joinable once ended)
        const r = new Room({ name: m.name, mode: m.mode, max: m.max, kind: m.kind, size: m.size, password: m.password, host: who.name, seed: m.seed, hostPid: who.pid });
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
    for (const [id, r] of rooms) if (!r.persistent && !r.online.size && r.emptySince && (r.ended || now() - r.emptySince > 10 * 60 * 1000)) { rooms.delete(id); log(`"${r.name}" ended`); }
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
    const shout = () => { const msg = Buffer.from(JSON.stringify({ reckoning: R.PROTOCOL, name, port, rooms: list().filter(r => !r.persistent) })); for (const a of broadcastAddrs()) beacon.send(msg, LAN_PORT, a, () => {}); };
    biv = setInterval(shout, 2000); setTimeout(shout, 100);
  }
  const stop = () => new Promise(ok => {
    clearInterval(iv1); clearInterval(iv2); clearInterval(iv3); if (biv) clearInterval(biv); if (beacon) try { beacon.close(); } catch (e) {}
    saveWorld(); for (const s of socks) s.close(); server.close(() => ok());
    setTimeout(ok, 1500);
  });
  return { port, stop, rooms, stats, name };
}
// a look, from a player: only colours and a few words, nothing else passed on
function sanitizeLook(l) {
  const o = {}; if (!l || typeof l !== "object") return o;
  for (const k of ["skin", "hair", "coat", "legs", "vest", "apron", "hatColor", "sash", "eyes", "linen", "stockings"]) if (Number.isFinite(+l[k]) && l[k] !== null && l[k] !== "") o[k] = (+l[k]) & 0xffffff;
  o.body = ["townsman", "townswoman", "brother", "sister"].includes(l.body) ? l.body : "townsman";
  o.sex = o.body === "townswoman" || o.body === "sister" ? "f" : "m";
  o.hat = l.hat === "none" ? "none" : "hat";
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
