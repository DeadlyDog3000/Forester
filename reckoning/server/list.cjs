// ===========================================================================
//  FORESTER: RECKONING — Copyright (c) 2026 Roan Fraese / DeadlyDog Productions
// ===========================================================================

// The mailing list: people who asked to hear when a game has news, and nothing else about them. An address goes on
// only once its owner clicks the link in the letter that asks (so nobody can put somebody else on it), and every letter
// carries a link that takes it off again at once.
//
//   GET  /list/open                            → { open }      whether letters can be sent (the website asks first)
//   POST /list/join     { email, game }        → { ok }        a letter asking them to confirm (the same answer whether
//                                                               or not the address was already on: it tells no one who is)
//   GET  /list/confirm?t=…                     → a page        on the list
//   GET  /list/leave?t=…                       → a page        off the list, and forgotten
//   GET  /list/all                (X-Admin, or ?t= the sales token)    → { people }    the confirmed, for the keeper of the site
//   POST /list/send               (X-Admin)    { subject, text, test } → { sent }   a letter to everyone on it (test: only
//                                                               to the site's own address)
//
// The letters go out through the shop's mail settings (SMTP_* in the shop's env file). The keeper's token is the one in
// <data>/reviews.admin. Everything is in <data>/list.json, written whole whenever it changes. Unconfirmed addresses are
// dropped after a week.

const fs = require("fs"), path = require("path"), crypto = require("crypto");
const mailer = require("./mailer.cjs");
const ipOf = require("./ipof.cjs");

const GAMES = { forester: "Forester", reckoning: "Forester: Reckoning", "standards-in-smoke": "Standards in Smoke" };
const EMAIL_RX = /^[^\s@<>"',;]{1,64}@[^\s@<>"',;]{1,190}\.[A-Za-z]{2,24}$/;
const PENDING_DAYS = 7;

module.exports = function makeList({ dataDir, envFile, tokenOk = () => false, log = () => {} }) {
  const file = dataDir ? path.join(dataDir, "list.json") : null;
  const adminFile = dataDir ? path.join(dataDir, "reviews.admin") : null;
  let db = { people: {} };
  try { if (file && fs.existsSync(file)) db = { ...db, ...JSON.parse(fs.readFileSync(file, "utf8")) }; } catch (e) { log("list: couldn't read", e.message); }
  const save = () => {
    if (!file) return;
    try { fs.mkdirSync(dataDir, { recursive: true }); fs.writeFileSync(file + ".tmp", JSON.stringify(db)); fs.renameSync(file + ".tmp", file); }
    catch (e) { log("list: couldn't save", e.message); }
  };

  // ---- the mail settings: the shop's own file, read again whenever it changes ----
  let env = {}, envAt = -1;
  const cfg = k => {
    try {
      const st = envFile && fs.statSync(envFile);
      if (!st || st.mtimeMs !== envAt) {
        envAt = st ? st.mtimeMs : 0; env = {};
        if (st) for (const line of fs.readFileSync(envFile, "utf8").split(/\r?\n/)) { const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/); if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, ""); }
      }
    } catch (e) { env = {}; envAt = 0; }
    return env[k] || process.env[k] || "";
  };
  const BASE = () => cfg("LIST_BASE") || "https://45-76-245-44.sslip.io";
  const SITE = "https://deadlydog3000.github.io/deadlydog-productions/";
  const canMail = () => !!(cfg("SMTP_USER") && cfg("SMTP_PASS"));
  const mail = (to, subject, text, html) => mailer.send({ host: cfg("SMTP_HOST") || "smtp.gmail.com", port: cfg("SMTP_PORT") || 465, secure: cfg("SMTP_TLS") !== "0",
    user: cfg("SMTP_USER"), pass: cfg("SMTP_PASS"), from: cfg("SMTP_FROM") || cfg("SMTP_USER"), fromName: "DeadlyDog Productions", to, subject, text, html });

  // (the keeper: the token in reviews.admin as X-Admin, or the shop's sales token as ?t=, which the admin panel holds)
  const isAdmin = (req, u) => {
    if (u && tokenOk(u.searchParams.get("t"))) return true;
    try {
      const want = adminFile && fs.existsSync(adminFile) ? fs.readFileSync(adminFile, "utf8").trim() : "";
      const got = String(req.headers["x-admin"] || "");
      return !!want && got.length === want.length && crypto.timingSafeEqual(Buffer.from(got), Buffer.from(want));
    } catch (e) { return false; }
  };
  // (rate limits: per address asking, an hour at a time, in memory only)
  const hits = new Map();
  const tooMany = (k, max) => {
    const t = Date.now(), h = (hits.get(k) || []).filter(x => t - x < 3600e3); h.push(t); hits.set(k, h);
    if (hits.size > 5000) for (const [kk, v] of hits) if (!v.some(x => t - x < 3600e3)) hits.delete(kk);
    return h.length > max;
  };
  const readBody = req => new Promise((ok, no) => {
    let n = 0; const chunks = [];
    req.on("data", c => { n += c.length; if (n > 65536) { no(new Error("too big")); req.destroy(); } else chunks.push(c); });
    req.on("end", () => { try { ok(chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {}); } catch (e) { no(new Error("bad json")); } });
    req.on("error", no);
  });
  const send = (res, code, o) => { res.setHeader("Content-Type", "application/json"); res.statusCode = code; res.end(JSON.stringify(o)); };
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const page = (res, title, body) => {
    res.setHeader("Content-Type", "text/html; charset=utf-8"); res.statusCode = 200;
    res.end(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${esc(title)}</title></head>
<body style="margin:0;background:#e9edf0;font:17px/1.55 Georgia,'Times New Roman',serif;color:#25303a"><div style="max-width:520px;margin:0 auto;padding:56px 24px">
<p style="margin:0 0 6px;font-size:13px;letter-spacing:.28em;text-transform:uppercase;color:#5a6570">DeadlyDog Productions</p>
<h1 style="margin:0 0 18px;font-weight:normal;font-size:28px">${esc(title)}</h1><p style="margin:0 0 24px">${body}</p>
<p style="margin:0"><a href="${SITE}" style="color:#2f5266">Back to the games</a></p></div></body></html>`);
  };
  const letterHtml = (heading, paras, foot) => `<!doctype html><html><body style="margin:0;padding:0;background:#e9edf0">
<div style="max-width:520px;margin:0 auto;padding:36px 24px;font:16px/1.55 Georgia,'Times New Roman',serif;color:#25303a">
<p style="margin:0 0 6px;font-size:13px;letter-spacing:.28em;text-transform:uppercase;color:#5a6570">DeadlyDog Productions</p>
<h1 style="margin:0 0 18px;font-weight:normal;font-size:26px">${esc(heading)}</h1>
${paras.map(p => `<p style="margin:0 0 14px">${p}</p>`).join("\n")}
<p style="margin:24px 0 0;color:#5a6570;font-size:13px">${foot}</p></div></body></html>`;

  const prune = () => {
    const cut = Date.now() - PENDING_DAYS * 86400e3; let n = 0;
    for (const [k, p] of Object.entries(db.people)) if (!p.confirmed && p.at < cut) { delete db.people[k]; n++; }
    if (n) save();
  };
  setInterval(prune, 6 * 3600e3).unref();
  const byToken = t => { t = String(t || ""); if (!/^[a-f0-9]{40}$/.test(t)) return null; return Object.entries(db.people).find(([, p]) => p.token === t) || null; };

  async function handle(u, req, res) {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Admin");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Cache-Control", "no-store");
    if (req.method === "OPTIONS") { res.statusCode = 204; return res.end(); }
    const route = u.pathname.slice("/list/".length);

    if (req.method === "GET" && route === "open") return send(res, 200, { open: canMail() });   // (the website shows its form only when it can work)
    if (req.method === "GET" && route === "confirm") {
      const hit = byToken(u.searchParams.get("t"));
      if (!hit) return page(res, "That link has run out", "It may be more than a week old, or the address was taken off the list since. You can sign up again on any of the games' pages.");
      if (!hit[1].confirmed) { hit[1].confirmed = Date.now(); save(); log("list: someone confirmed"); }
      return page(res, "You're on the list", "Thank you. You'll get a letter when there is real news: a big update, a new game, a sale. Never more than a few a year, and every one has a link at the bottom that takes you off at once.");
    }
    if (req.method === "GET" && route === "leave") {
      const hit = byToken(u.searchParams.get("t"));
      if (hit) { delete db.people[hit[0]]; save(); log("list: someone left"); }
      return page(res, "You're off the list", "Your address has been deleted, and nothing more will be sent to it.");
    }
    if (req.method === "GET" && route === "all") {
      if (!isAdmin(req, u)) return send(res, 403, { error: "Not yours to see." });
      const people = Object.entries(db.people).filter(([, p]) => p.confirmed).map(([email, p]) => ({ email, games: p.games, at: p.confirmed }));
      return send(res, 200, { people, pending: Object.values(db.people).filter(p => !p.confirmed).length });
    }
    if (req.method !== "POST") return send(res, 404, {});
    let b; try { b = await readBody(req); } catch (e) { return send(res, 400, { error: "That request couldn't be read." }); }

    if (route === "join") {
      if (String(b.website || "").trim()) return send(res, 200, { ok: true });   // (a bot filled the field people never see)
      const email = String(b.email || "").trim().toLowerCase(), game = GAMES[b.game] ? String(b.game) : null;
      if (!EMAIL_RX.test(email)) return send(res, 400, { error: "That doesn't look like an email address." });
      if (!canMail()) return send(res, 503, { error: "The list isn't taking names yet. Try again soon." });
      if (tooMany("join:" + ipOf(req), 6) || tooMany("to:" + email, 3)) return send(res, 429, { error: "Too many tries from here. Try again in an hour." });
      let p = db.people[email];
      if (p && p.confirmed) { if (game && !p.games.includes(game)) { p.games.push(game); save(); } return send(res, 200, { ok: true }); }
      if (!p) p = db.people[email] = { games: [], at: Date.now(), token: crypto.randomBytes(20).toString("hex"), confirmed: 0 };
      if (game && !p.games.includes(game)) p.games.push(game);
      p.at = Date.now(); save();
      const yes = `${BASE()}/list/confirm?t=${p.token}`;
      const what = game ? GAMES[game] : "the games";
      try {
        await mail(email, "Confirm: news from DeadlyDog Productions",
          `Someone, we hope you, asked for news about ${what} to be sent to this address.\n\nTo say yes: ${yes}\n\nIf it wasn't you, do nothing: the address is forgotten in a week.\n\n— Roan, DeadlyDog Productions`,
          letterHtml("One click to confirm", [`Someone, we hope you, asked for news about ${esc(what)} to be sent to this address.`,
            `<a href="${yes}" style="display:inline-block;padding:12px 22px;background:#2f5266;color:#fff;text-decoration:none;border-radius:4px">Yes, send me the news</a>`],
            "If it wasn't you, do nothing: the address is forgotten in a week. — Roan, DeadlyDog Productions"));
      } catch (e) { log("list: couldn't send a confirmation:", e.message); return send(res, 502, { error: "The letter couldn't be sent just now. Try again in a little while." }); }
      return send(res, 200, { ok: true });
    }
    if (route === "send") {
      if (!isAdmin(req, u)) return send(res, 403, { error: "Not yours to do." });
      const subject = String(b.subject || "").trim().slice(0, 140), text = String(b.text || "").trim().slice(0, 20000);
      if (!subject || text.length < 20) return send(res, 400, { error: "A letter needs a subject and a body." });
      if (!canMail()) return send(res, 503, { error: "No mail settings on the server." });
      const to = b.test ? [[cfg("SMTP_FROM") || cfg("SMTP_USER"), { token: "test" }]] : Object.entries(db.people).filter(([, p]) => p.confirmed);
      const paras = text.split(/\n\s*\n/).map(x => esc(x).replace(/\n/g, "<br>"));
      let sent = 0, failed = 0;
      for (const [email, p] of to) {
        const off = `${BASE()}/list/leave?t=${p.token}`;
        try {
          await mail(email, subject, `${text}\n\n—\nYou asked for news from DeadlyDog Productions. To stop: ${off}`,
            letterHtml(subject, paras, `You asked for news from DeadlyDog Productions. <a href="${off}" style="color:#5a6570">Take me off the list</a>`));
          sent++;
        } catch (e) { failed++; log("list: a letter failed:", e.message); }
        await new Promise(r => setTimeout(r, 1200));   // (gently: a mail service frowns on a burst)
      }
      log(`list: a letter sent to ${sent}${failed ? `, ${failed} failed` : ""}`);
      return send(res, 200, { sent, failed });
    }
    return send(res, 404, {});
  }
  return { handle, count: () => Object.values(db.people).filter(p => p.confirmed).length };
};
