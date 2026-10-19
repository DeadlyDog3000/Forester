// ===========================================================================
//  FORESTER: RECKONING — Copyright (c) 2026 Roan Fraese / DeadlyDog Productions
// ===========================================================================

// THE REVIEWS: the website's own — accounts to sign in with, and the reviews they write, kept here. Each account can
// have at most two reviews on each game, and can change or take down its own whenever it likes.
//
//   POST /reviews/signup   { user, password }               → { token, user }   a new account, signed in
//   POST /reviews/login    { user, password }               → { token, user }
//   POST /reviews/logout                                    → { ok }
//   GET  /reviews/me                                        → { user }          who the token is (or { user: null })
//   GET  /reviews/list?game=reckoning                       → { reviews: [...] }
//   POST /reviews/post     { game, rating, title, body }    → { review }
//   POST /reviews/edit     { id, rating, title, body }      → { review }
//   POST /reviews/delete   { id }                           → { ok }
//
// Signed in by a token in the Authorization header ("Bearer …"), handed out at signup and login. Passwords are kept
// only as scrypt hashes, each with its own salt; tokens only as their sha256, so the file on disk can't sign anyone in.
// The keeper of the site can take down any review: POST /reviews/delete with the token in <data>/reviews.admin as
// X-Admin. Everything is in <data>/reviews.json, written whole (to a .tmp, then renamed) whenever it changes.

const fs = require("fs"), path = require("path"), crypto = require("crypto");

const GAMES = new Set(["forester", "reckoning", "standards-in-smoke"]);
const PER_GAME = 2;
const SESSION_DAYS = 90;
const USER_RX = /^[A-Za-z0-9][A-Za-z0-9_ .-]{1,22}[A-Za-z0-9]$/;

module.exports = function makeReviews({ dataDir, log = () => {} }) {
  const file = dataDir ? path.join(dataDir, "reviews.json") : null;
  const adminFile = dataDir ? path.join(dataDir, "reviews.admin") : null;
  let db = { accounts: {}, sessions: {}, reviews: [] };
  try { if (file && fs.existsSync(file)) db = { ...db, ...JSON.parse(fs.readFileSync(file, "utf8")) }; } catch (e) { log("reviews: couldn't read", e.message); }
  const save = () => {
    if (!file) return;
    try { fs.mkdirSync(dataDir, { recursive: true }); fs.writeFileSync(file + ".tmp", JSON.stringify(db)); fs.renameSync(file + ".tmp", file); }
    catch (e) { log("reviews: couldn't save", e.message); }
  };

  const now = () => Date.now();
  const sha = t => crypto.createHash("sha256").update(String(t)).digest("hex");
  const hashPw = (pw, salt) => crypto.scryptSync(String(pw), salt, 64).toString("hex");
  const same = (a, b) => { const x = Buffer.from(a, "hex"), y = Buffer.from(b, "hex"); return x.length === y.length && crypto.timingSafeEqual(x, y); };
  const clean = (s, n) => String(s == null ? "" : s).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").trim().slice(0, n);

  // ---- too many tries: sign-ins that fail, and new accounts, counted per address for an hour ----
  const tries = new Map();
  const tooMany = (key, max) => {
    const t = now(), a = (tries.get(key) || []).filter(x => t - x < 3600e3);
    tries.set(key, a);
    return a.length >= max;
  };
  const tried = key => { const a = tries.get(key) || []; a.push(now()); tries.set(key, a); };
  setInterval(() => { const t = now(); for (const [k, a] of tries) if (!a.some(x => t - x < 3600e3)) tries.delete(k); }, 600e3).unref();

  const newSession = name => {
    const token = crypto.randomBytes(32).toString("hex");
    db.sessions[sha(token)] = { user: name.toLowerCase(), at: now() };
    // (old ones dropped as new ones are made)
    const cut = now() - SESSION_DAYS * 864e5;
    for (const [k, s] of Object.entries(db.sessions)) if (s.at < cut) delete db.sessions[k];
    save();
    return token;
  };
  const whoIs = req => {
    const m = String(req.headers.authorization || "").match(/^Bearer ([a-f0-9]{64})$/);
    const s = m && db.sessions[sha(m[1])];
    if (!s || s.at < now() - SESSION_DAYS * 864e5) return null;
    const a = db.accounts[s.user];
    return a ? { key: s.user, name: a.name } : null;
  };
  const isAdmin = req => {
    try {
      const want = adminFile && fs.existsSync(adminFile) ? fs.readFileSync(adminFile, "utf8").trim() : "";
      const got = String(req.headers["x-admin"] || "");
      return !!want && got.length === want.length && crypto.timingSafeEqual(Buffer.from(got), Buffer.from(want));
    } catch (e) { return false; }
  };
  const pub = r => ({ id: r.id, game: r.game, user: db.accounts[r.user] ? db.accounts[r.user].name : r.user, rating: r.rating, title: r.title, body: r.body, at: r.at, edited: r.edited || null, mine: false });

  const readBody = req => new Promise((ok, no) => {
    let n = 0; const chunks = [];
    req.on("data", c => { n += c.length; if (n > 16384) { no(new Error("too big")); req.destroy(); } else chunks.push(c); });
    req.on("end", () => { try { ok(chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {}); } catch (e) { no(new Error("bad json")); } });
    req.on("error", no);
  });
  // (the address: the connection's own — or, when it comes through the https proxy on this same machine, the last one the
  //  proxy itself added, never one the browser could have written in)
  const ipOf = req => { const ra = req.socket.remoteAddress || "?"; if (!/^(::ffff:)?127\.0\.0\.1$|^::1$/.test(ra)) return ra; const x = String(req.headers["x-forwarded-for"] || "").split(",").map(s => s.trim()).filter(Boolean); return x[x.length - 1] || ra; };
  const send = (res, code, o) => { res.statusCode = code; res.end(JSON.stringify(o)); };
  const fields = b => {
    const rating = Math.round(Number(b.rating));
    if (!(rating >= 1 && rating <= 5)) return { error: "Pick a rating from one to five stars." };
    const body = clean(b.body, 2000), title = clean(b.title, 80);
    if (body.length < 10) return { error: "Write a little more: the review itself is too short." };
    return { rating, title, body };
  };

  async function handle(u, req, res) {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Admin");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Cache-Control", "no-store");
    if (req.method === "OPTIONS") { res.statusCode = 204; return res.end(); }
    const route = u.pathname.slice("/reviews/".length);
    const me = whoIs(req);

    if (req.method === "GET" && route === "me") return send(res, 200, { user: me ? me.name : null });
    if (req.method === "GET" && route === "list") {
      const game = String(u.searchParams.get("game") || "");
      if (!GAMES.has(game)) return send(res, 400, { error: "No such game." });
      const list = db.reviews.filter(r => r.game === game).sort((a, b) => b.at - a.at).map(r => ({ ...pub(r), mine: !!me && r.user === me.key }));
      return send(res, 200, { reviews: list, perGame: PER_GAME, left: me ? PER_GAME - db.reviews.filter(r => r.game === game && r.user === me.key).length : null });
    }
    if (req.method !== "POST") return send(res, 404, {});
    let b; try { b = await readBody(req); } catch (e) { return send(res, 400, { error: "That request couldn't be read." }); }
    const ip = ipOf(req);

    if (route === "signup") {
      if (clean(b.website, 200)) return send(res, 200, { ok: true });   // (a bot filled the field people never see)
      const name = clean(b.user, 24), pw = String(b.password || "");
      if (!USER_RX.test(name)) return send(res, 400, { error: "A username is 3 to 24 letters or numbers (spaces, dots, dashes and underscores allowed in the middle)." });
      if (pw.length < 8 || pw.length > 200) return send(res, 400, { error: "A password needs at least 8 characters." });
      if (tooMany("signup:" + ip, 5)) return send(res, 429, { error: "Too many new accounts from here. Try again in an hour." });
      const key = name.toLowerCase();
      if (db.accounts[key]) return send(res, 409, { error: "That username is taken." });
      const salt = crypto.randomBytes(16).toString("hex");
      db.accounts[key] = { name, salt, hash: hashPw(pw, salt), at: now() };
      tried("signup:" + ip);
      log("reviews: new account", name);
      return send(res, 200, { token: newSession(name), user: name });
    }
    if (route === "login") {
      const name = clean(b.user, 24), key = name.toLowerCase(), pw = String(b.password || "");
      if (tooMany("login:" + ip, 20) || tooMany("login:" + key, 10)) return send(res, 429, { error: "Too many tries. Wait a while and try again." });
      const a = db.accounts[key];
      // (the same work done whether or not the account exists, so the answer's time doesn't say which)
      const h = hashPw(pw, a ? a.salt : "0".repeat(32));
      if (!a || !same(h, a.hash)) { tried("login:" + ip); tried("login:" + key); return send(res, 401, { error: "That username and password don't match." }); }
      return send(res, 200, { token: newSession(a.name), user: a.name });
    }
    if (route === "logout") {
      const m = String(req.headers.authorization || "").match(/^Bearer ([a-f0-9]{64})$/);
      if (m) { delete db.sessions[sha(m[1])]; save(); }
      return send(res, 200, { ok: true });
    }
    if (route === "delete" && isAdmin(req)) {
      const n = db.reviews.length; db.reviews = db.reviews.filter(r => r.id !== String(b.id)); save();
      return send(res, 200, { ok: db.reviews.length < n });
    }
    if (!me) return send(res, 401, { error: "Sign in first." });
    if (route === "post") {
      const game = String(b.game || "");
      if (!GAMES.has(game)) return send(res, 400, { error: "No such game." });
      if (db.reviews.filter(r => r.game === game && r.user === me.key).length >= PER_GAME) return send(res, 409, { error: `You already have ${PER_GAME} reviews of this game. Edit or delete one to write another.` });
      const f = fields(b); if (f.error) return send(res, 400, f);
      const r = { id: crypto.randomBytes(8).toString("hex"), game, user: me.key, ...f, at: now() };
      db.reviews.push(r); save();
      log("reviews: posted on", game, "by", me.name);
      return send(res, 200, { review: { ...pub(r), mine: true } });
    }
    const r = db.reviews.find(x => x.id === String(b.id || ""));
    if (route === "edit") {
      if (!r || r.user !== me.key) return send(res, 404, { error: "That review isn't yours, or it's gone." });
      const f = fields(b); if (f.error) return send(res, 400, f);
      Object.assign(r, f, { edited: now() }); save();
      return send(res, 200, { review: { ...pub(r), mine: true } });
    }
    if (route === "delete") {
      if (!r || r.user !== me.key) return send(res, 404, { error: "That review isn't yours, or it's gone." });
      db.reviews = db.reviews.filter(x => x !== r); save();
      return send(res, 200, { ok: true });
    }
    return send(res, 404, {});
  }
  return { handle };
};
