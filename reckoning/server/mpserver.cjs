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

let R = null, T = null;              // the rules and the land (ES modules, shared with the game: loaded at start)
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
      else if (len === 127) { if (b.length < 10) return; const big = b.readBigUInt64BE(2); if (big > 1n << 20n) throw new Error("too big"); len = Number(big); o = 10; }
      if (len > 1 << 20) throw new Error("too big");
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
  deliver(data) { if (this.onmessage) this.onmessage(data.toString("utf8")); }
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
    this.mode = R.MODES[o.mode] ? o.mode : "coop";
    this.max = Math.max(2, Math.min(o.persistent ? 500 : 16, num(o.max, 8) | 0));
    this.kind = T.TERRAINS[o.kind] ? o.kind : "island";
    this.size = R.SIZES[o.size] ? o.size : "m";
    this.half = o.half || R.SIZES[this.size];
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
    this.day0 = now() - crypto.randomInt(0, R.DAY_MS) + 0;   // (a game starts at some hour of the day)
    this.day0 = now() - R.DAY_MS * 0.3;                       // (in the morning, in fact)
    this.spawnAt = this.land.findHome(T.seq(this.seed ^ 0x5eed), [], 0);
    this.shared = { wood: R.START_STOCK.wood, stone: R.START_STOCK.stone };   // (co-op: one colony, one store)
    this.dirty = false;
  }
  storeOf(pid) { return this.mode === "coop" ? this.shared : this.recs[pid]; }
  meta() {
    return { id: this.id, name: this.name, mode: this.mode, kind: this.kind, size: this.size, half: this.half, players: this.online.size, max: this.max, host: this.host, locked: !!this.password, persistent: this.persistent };
  }
  // ---- saving the wide world ----
  toJSON() { return { shared: this.shared, id: this.id, name: this.name, mode: this.mode, kind: this.kind, half: this.half, seed: this.seed, max: this.max, persistent: true, recs: this.recs, felled: this.felled, broken: this.broken, buildings: this.buildings, groups: this.groups, nextB: this.nextB, day0: this.day0 }; }
  static from(j) {
    const r = new Room(j);
    Object.assign(r, { shared: j.shared || r.shared, recs: j.recs || {}, felled: j.felled || {}, broken: j.broken || {}, buildings: j.buildings || {}, groups: j.groups || {}, nextB: j.nextB || 1, day0: j.day0 || r.day0 });
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
    if (!rec) rec = this.recs[who.pid] = { name: who.name, look: who.look, wood: R.START_STOCK.wood, stone: R.START_STOCK.stone, home: null, kills: 0, deaths: 0, group: null, first: now() };
    rec.name = who.name; rec.look = who.look; rec.seen = now();
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
    sock.send({ t: "in", room: { ...this.meta(), seed: this.seed }, you: { pid: p.pid, x: p.x, z: p.z, wood: this.storeOf(p.pid).wood, stone: this.storeOf(p.pid).stone, shield: R.SPAWN_SHIELD_MS, home: hearth ? hearth.id : null },
      players: [...this.online.values()].filter(q => q !== p).map(q => this.pub(q)), felled: live(this.felled, t), broken: live(this.broken, t),
      buildings: Object.values(this.buildings), groups: this.groups, day: { t: (t - this.day0) % R.DAY_MS, len: R.DAY_MS }, chat: this.chat.slice(-20),
      online: this.onlineNames() });
    this.all({ t: "pj", p: this.pub(p) }, p);
    this.note(`${p.name} has come.`, p);
    this.dirty = true;
  }
  onlineNames() { return [...this.online.values()].map(q => q.pid); }
  leave(p) {
    if (!this.online.has(p.pid) || this.online.get(p.pid) !== p) return;
    this.online.delete(p.pid); p.sock.player = null;
    const r = this.recs[p.pid]; if (r) r.seen = now();
    this.all({ t: "pl", pid: p.pid });
    this.note(`${p.name} has gone.`);
    if (!this.online.size) this.emptySince = now();
    this.dirty = true;
  }
  note(text, except) { this.all({ t: "note", text }, except); }
  stock(p) {
    // (a co-op colony's store is everyone's: all are told)
    if (this.mode === "coop") { this.all({ t: "stock", wood: this.shared.wood, stone: this.shared.stone }); return; }
    const r = this.recs[p.pid]; p.sock.send({ t: "stock", wood: r.wood, stone: r.stone });
  }
  near(p, x, z, d) { return Math.hypot(p.x - x, p.z - z) <= d; }
  // ---- what players do ----
  on(p, m) {
    const rec = this.recs[p.pid], st = this.storeOf(p.pid), t = now();
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
        const face = Math.atan2(p.x - q.x, p.z - q.z), diff = Math.abs(Math.atan2(Math.sin(face - (q.yaw + Math.PI)), Math.cos(face - (q.yaw + Math.PI))));
        const guarded = q.g && diff < 1.2;
        if (guarded) dmg *= 0.25;
        p.shield = 0;                 // (striking someone ends your own grace)
        q.hp = Math.max(0, q.hp - dmg); q.hurtAt = t;
        this.all({ t: "hp", pid: q.pid, hp: q.hp, by: p.pid, guarded });
        if (q.hp > 0) return;
        q.dead = true;
        const vr = this.recs[q.pid], w = Math.floor(vr.wood * 0.2), s = Math.floor(vr.stone * 0.2);
        vr.wood -= w; vr.stone -= s; st.wood += w; st.stone += s; rec.kills++; vr.deaths++;
        this.all({ t: "die", pid: q.pid, by: p.pid, got: { wood: w, stone: s } });
        this.stock(p); this.stock(q); this.dirty = true;
        setTimeout(() => this.respawn(q), R.RESPAWN_MS);
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
    }
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
  }
  slow() {
    const t = now(), back = [], rocks = [];
    for (const [id, at] of Object.entries(this.felled)) if (at <= t) { delete this.felled[id]; back.push(id); }
    for (const [id, at] of Object.entries(this.broken)) if (at <= t) { delete this.broken[id]; rocks.push(id); }
    if (back.length || rocks.length) { this.all({ t: "grow", trees: back, rocks }); this.dirty = true; }
    for (const [k, at] of this.invites) if (t - at > 120000) this.invites.delete(k);
    // wounds mend, a while after the last blow
    for (const p of this.online.values()) if (!p.dead && p.hp < R.MAX_HP && t - (p.hurtAt || 0) > 8000) { p.hp = Math.min(R.MAX_HP, p.hp + 4); this.all({ t: "hp", pid: p.pid, hp: p.hp, heal: true }); }
  }
}

// ---------------------------------------------------------------------------
//  the server
// ---------------------------------------------------------------------------
async function start(opts = {}) {
  const base = pathToFileURL(path.join(__dirname, "..", "js", "mp") + path.sep).href;
  R = await import(base + "rules.js"); T = await import(base + "terrain.js");
  const rooms = new Map();
  const name = clean(opts.name, 40) || (opts.world ? "Forester: Reckoning" : `${os.hostname().replace(/\.(local|lan|home)$/, "")}'s games`);
  const dataDir = opts.data ? path.resolve(opts.data) : null;
  const log = opts.log || (opts.quiet ? () => {} : (...a) => console.log(`[${new Date().toISOString()}]`, ...a));
  // the wide world: from disk, or made new
  let world = null;
  if (opts.world) {
    const f = dataDir && path.join(dataDir, "world.json");
    try { if (f && fs.existsSync(f)) world = Room.from(JSON.parse(fs.readFileSync(f, "utf8"))); } catch (e) { log("world file unreadable:", e.message); }
    if (!world) world = new Room({ id: "world", name: "The Wide World", mode: "pvp", kind: "highlands", max: 500, persistent: true, half: R.WORLD_HALF, seed: opts.seed });
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
  const list = () => [...rooms.values()].map(r => r.meta());
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
        const r = new Room({ name: m.name, mode: m.mode, max: m.max, kind: m.kind, size: m.size, password: m.password, host: who.name, seed: m.seed });
        rooms.set(r.id, r); log(`hosted "${r.name}" (${r.mode}, ${r.kind}, ${r.size}) by ${who.name}`);
        if (ws.player) ws.player.room.leave(ws.player);
        return r.join(ws, who, r.password);
      }
      if (m.t === "join") {
        const r = rooms.get(String(m.room || "")); if (!r) return ws.send({ t: "err", text: "That game has ended." });
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
    for (const [id, r] of rooms) if (!r.persistent && !r.online.size && r.emptySince && now() - r.emptySince > 10 * 60 * 1000) { rooms.delete(id); log(`"${r.name}" ended`); }
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
  for (const k of ["skin", "hair", "coat", "legs", "vest", "apron", "hatColor", "sash"]) if (Number.isFinite(+l[k]) && l[k] !== null && l[k] !== "") o[k] = (+l[k]) & 0xffffff;
  o.body = ["townsman", "townswoman", "brother", "sister"].includes(l.body) ? l.body : "townsman";
  o.sex = o.body === "townswoman" || o.body === "sister" ? "f" : "m";
  o.hat = l.hat === "none" ? "none" : "hat";
  o.height = Math.max(0.92, Math.min(1.08, num(l.height, 1)));
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
  start({ port: +(arg("port", process.env.PORT || 8080)), world: !!arg("world", false), data: arg("data", "./world-data"), name: arg("name", ""), lan: !!arg("lan", false), seed: arg("seed") ? +arg("seed") : undefined })
    .then(s => { const bye = () => s.stop().then(() => process.exit(0)); process.on("SIGINT", bye); process.on("SIGTERM", bye); })
    .catch(e => { console.error(e); process.exit(1); });
}
