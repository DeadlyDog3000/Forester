// ===========================================================================
//  FORESTER: RECKONING — Copyright (c) 2026 Roan Fraese / DeadlyDog Productions
// ===========================================================================

// HOW MANY PLAY: an anonymous count, for the studio's own eyes. When the desktop game starts it says hello with a random
// number it made for itself the first time it ran (nothing else about the computer or the person), its version, its
// platform and whether it's the full game or the demo. Kept here: that number only as a salted hash, and tallies by day.
// No address, no name, nothing that could find anyone.
//
//   GET /hello?i=<8–32 hex>&v=<version>&p=<mac|win|web>&f=<1|0>   204
//   GET /stats?t=<the shop's sales token>                         { installs, today, week, launches, byVersion, … }

const fs = require("fs"), path = require("path"), crypto = require("crypto");

const KEEP_DAYS = 90;

module.exports = function makeStats({ dataDir, tokenOk, log = () => {} }) {
  const file = dataDir ? path.join(dataDir, "stats.json") : null;
  let S = { salt: "", seen: {}, days: {} };
  try { if (file && fs.existsSync(file)) S = { salt: "", seen: {}, days: {}, ...JSON.parse(fs.readFileSync(file, "utf8")) }; } catch (e) { log("stats: unreadable:", e.message); }
  if (!S.salt) S.salt = crypto.randomBytes(24).toString("hex");
  let dirty = true;
  const save = () => {
    if (!file || !dirty) return; dirty = false;
    try { fs.mkdirSync(dataDir, { recursive: true }); fs.writeFileSync(file + ".tmp", JSON.stringify(S)); fs.renameSync(file + ".tmp", file); } catch (e) { log("stats: couldn't save:", e.message); }
  };
  setInterval(save, 30000).unref();

  const day = (t = Date.now()) => new Date(t).toISOString().slice(0, 10);
  const trim = () => { const cut = day(Date.now() - KEEP_DAYS * 86400000); for (const d of Object.keys(S.days)) if (d < cut) delete S.days[d]; };

  // (a few hellos an hour from one place at most: the address is used for that and forgotten, never written down)
  const asks = new Map();
  const tooMany = req => { const ip = (req.socket && req.socket.remoteAddress) || "x", t = Date.now(), l = (asks.get(ip) || []).filter(x => t - x < 3600000); l.push(t); asks.set(ip, l); if (asks.size > 5000) asks.clear(); return l.length > 20; };

  const clean = (s, n) => String(s || "").replace(/[^A-Za-z0-9._-]/g, "").slice(0, n);

  function hello(u, req, res) {
    const i = String(u.searchParams.get("i") || "");
    if (!/^[0-9a-f]{8,32}$/i.test(i) || tooMany(req)) { res.statusCode = 204; return res.end(); }
    const h = crypto.createHash("sha256").update(i.toLowerCase() + S.salt).digest("hex").slice(0, 24);
    const v = clean(u.searchParams.get("v"), 16) || "?", p = ["mac", "win", "web"].includes(u.searchParams.get("p")) ? u.searchParams.get("p") : "other", f = u.searchParams.get("f") === "1";
    const d = day();
    const D = S.days[d] || (S.days[d] = { ids: {}, launches: 0 });
    D.ids[h] = (D.ids[h] || 0) + 1; D.launches++;
    const r = S.seen[h] || (S.seen[h] = { first: d });
    r.last = d; r.v = v; r.p = p; r.f = f ? 1 : 0; r.n = (r.n || 0) + 1;
    trim(); dirty = true;
    res.statusCode = 204; res.end();
  }

  function stats(u, res) {
    if (!tokenOk(u.searchParams.get("t"))) { res.statusCode = 403; return res.end(JSON.stringify({ error: "no" })); }
    const today = day(), weekCut = day(Date.now() - 6 * 86400000);
    const week = new Set(); let launches = 0;
    for (const [d, D] of Object.entries(S.days)) if (d >= weekCut) for (const h of Object.keys(D.ids)) week.add(h);
    const byVersion = {}, byPlatform = {}; let full = 0, demo = 0;
    for (const r of Object.values(S.seen)) { byVersion[r.v] = (byVersion[r.v] || 0) + 1; byPlatform[r.p] = (byPlatform[r.p] || 0) + 1; if (r.f) full++; else demo++; launches += r.n || 0; }
    const days = [];
    for (let k = KEEP_DAYS - 1; k >= 0; k--) { const d = day(Date.now() - k * 86400000), D = S.days[d]; days.push({ d, players: D ? Object.keys(D.ids).length : 0, launches: D ? D.launches : 0 }); }
    res.end(JSON.stringify({ installs: Object.keys(S.seen).length, today: S.days[today] ? Object.keys(S.days[today].ids).length : 0, week: week.size, launches, byVersion, byPlatform, full, demo, days }));
  }

  return { hello, stats, save };
};
