// ===========================================================================
//  FORESTER: RECKONING — Copyright (c) 2026 Roan Fraese / DeadlyDog Productions
// ===========================================================================

// WHAT WENT WRONG: error reports from the games of players who said yes to sending them (the game asks the first time
// something goes wrong). Each is the error's message and where in the game's code it happened, the game's version,
// platform, full or demo, and which screen it was on. No name, no address, nothing about the computer: kept grouped by
// the error, with how many times it came and on which versions, the newest few hundred.
//
//   POST /crash  { v, p, f, where, msg, stack }        204
//   GET  /crash?t=<the shop's sales token>            { groups: [{ msg, stack, where, n, first, last, versions }] }

const fs = require("fs"), path = require("path");
const ipOf = require("./ipof.cjs");

const KEEP = 300;

module.exports = function makeCrashes({ dataDir, tokenOk, log = () => {} }) {
  const file = dataDir ? path.join(dataDir, "crashes.json") : null;
  let groups = {};
  try { if (file && fs.existsSync(file)) groups = JSON.parse(fs.readFileSync(file, "utf8")) || {}; } catch (e) { log("crashes: unreadable:", e.message); }
  let T = null;
  const save = () => { if (!file || T) return; T = setTimeout(() => { T = null; try { fs.writeFileSync(file + ".tmp", JSON.stringify(groups)); fs.renameSync(file + ".tmp", file); } catch (e) { log("crashes: couldn't save:", e.message); } }, 3000); };
  const asks = new Map();
  // (a few an hour from any one game: a fault in a loop sends the same thing over and over)
  const tooOften = req => { const ip = ipOf(req), t = Date.now(), l = (asks.get(ip) || []).filter(x => t - x < 3600000); if (l.length >= 20) return true; l.push(t); asks.set(ip, l); if (asks.size > 5000) asks.clear(); return false; };
  // (nothing that could name anyone: a path on someone's computer cut down to the game's own files)
  const clean = (s, n) => String(s || "").replace(/(file:\/\/)?\/(Users|home)\/[^/\s)]+/g, "~").replace(/[A-Z]:\\Users\\[^\\\s)]+/gi, "~").replace(/app:\/\/forester\//g, "").slice(0, n);
  const body = (req, max) => new Promise(ok => { let d = "", over = false; req.on("data", c => { d += c; if (d.length > max) { over = true; req.destroy(); } }); req.on("end", () => { if (over) return ok(null); try { ok(JSON.parse(d)); } catch (e) { ok(null); } }); req.on("error", () => ok(null)); });
  async function handle(u, req, res) {
    if (req.method === "OPTIONS") { res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS"); res.setHeader("Access-Control-Allow-Headers", "Content-Type"); res.statusCode = 204; return res.end(); }
    if (req.method === "GET") {
      if (!tokenOk(u.searchParams.get("t"))) { res.statusCode = 403; return res.end(JSON.stringify({ error: "no" })); }
      return res.end(JSON.stringify({ groups: Object.values(groups).sort((a, b) => b.last - a.last) }));
    }
    if (req.method !== "POST") { res.statusCode = 405; return res.end("{}"); }
    if (tooOften(req)) { res.statusCode = 429; return res.end("{}"); }
    const m = await body(req, 8192);
    if (!m || typeof m.msg !== "string" || !m.msg.trim()) { res.statusCode = 400; return res.end("{}"); }
    const msg = clean(m.msg, 300), stack = clean(m.stack, 2000), where = clean(m.where, 60), v = String(m.v || "").replace(/[^0-9a-z.\-]/gi, "").slice(0, 20) || "?";
    // (the same error from the same place: one group — its message, and the first line of where it was)
    const at = (stack.split("\n").find(l => /\.js:\d+/.test(l)) || "").trim(), sig = (msg.replace(/\d+/g, "#") + "|" + at.replace(/:\d+:\d+/, "")).slice(0, 400);
    const now = Date.now(), g = groups[sig] ||= { msg, stack, where, n: 0, first: now, last: now, versions: {}, platforms: {}, full: 0 };
    g.n++; g.last = now; g.stack = stack || g.stack; g.where = where || g.where; g.versions[v] = (g.versions[v] || 0) + 1;
    const p = /^(mac|win|web|linux)$/.test(m.p) ? m.p : "?"; g.platforms[p] = (g.platforms[p] || 0) + 1; if (m.f) g.full++;
    const all = Object.entries(groups); if (all.length > KEEP) for (const [k] of all.sort((a, b) => a[1].last - b[1].last).slice(0, all.length - KEEP)) delete groups[k];
    if (g.n === 1) log(`crash: ${msg.slice(0, 120)} (${v})`);
    save(); res.statusCode = 204; return res.end();
  }
  return { handle };
};
