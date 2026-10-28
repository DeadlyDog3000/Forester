// ===========================================================================
//  FORESTER: RECKONING — Copyright (c) 2026 Roan Fraese / DeadlyDog Productions
// ===========================================================================

// THE SHOP: the full game sold through Stripe Checkout (Stripe's own payment page), and the licence keys that unlock
// it — made here, kept here, and checked here.
//
// No webhooks: Stripe will only send those to an https address, and this server is plain http. Instead every key is
// made when its checkout is opened, written into the payment itself (its description and metadata, so it's on the
// Stripe dashboard and in the buyer's receipt), and is good only once Stripe says that checkout was paid — asked of
// Stripe directly, whenever the key is first used, and again now and then after (a refund or a dispute takes it back).
//
//   GET /shop/status          { on, live, sale }              — is the shop open, and any sale on
//   GET /shop/start           { url, claim }                  — from the game: a checkout, and a ticket to claim its key
//   GET /shop/claim?c=        { state: pending|paid|gone, key }  — the game asking whether it's paid yet
//   GET /shop/buy             303 → Stripe Checkout           — from the website's Buy button
//   GET /shop/key?s=cs_…      a page with the key             — the website's thank-you page links here
//   licence(op, key, …)       activate / validate / deactivate one of our keys (FR-…), for /licence
//
// Every key is also emailed to its buyer the moment the payment's known — found by whichever comes first: the game
// asking, the thank-you page, or a look through Stripe's finished checkouts every minute (so a buyer who closes the tab
// before it loads still gets the letter). Sent through any mail service's SMTP (SMTP_HOST, SMTP_USER, SMTP_PASS), from SMTP_FROM — Brevo's, or Gmail's with an app password.
//
// The secrets live in a file beside the server's data, never in the code: STRIPE_SECRET_KEY (a restricted key will
// do: Checkout Sessions write, Payment Intents and Charges read) and STRIPE_PRICE (the price_… of the game). It's read
// again whenever it changes, so setting it needs no restart.

const fs = require("fs"), path = require("path"), crypto = require("crypto"), https = require("https"), http = require("http");
const ipOf = require("./ipof.cjs");
const mailer = require("./mailer.cjs");

const MAX_COMPUTERS = 3;
const KEY_RX = /^FR(-[A-Z2-9]{5}){4}$/;

module.exports = function makeShop({ dataDir, envFile, log = () => {} }) {
  // ---- the settings, from the file (or the environment) ----
  let env = {}, envAt = -1;
  const readEnv = () => {
    try {
      const st = envFile && fs.statSync(envFile);
      if (st && st.mtimeMs === envAt) return env;
      envAt = st ? st.mtimeMs : 0; env = {};
      if (st) for (const line of fs.readFileSync(envFile, "utf8").split(/\r?\n/)) { const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/); if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, ""); }
    } catch (e) { env = {}; envAt = 0; }
    return env;
  };
  const cfg = k => readEnv()[k] || process.env[k] || "";
  const SITE = () => cfg("SHOP_SITE") || "https://deadlydog3000.github.io/deadlydog-productions/reckoning.html";
  // (where a buyer writes for help: the address the keys are sent from — a real inbox, whoever runs the shop)
  const contact = () => cfg("SMTP_FROM") || cfg("SMTP_USER") || "the address on the game's page";
  const isOn = () => !!(cfg("STRIPE_SECRET_KEY") && cfg("STRIPE_PRICE"));
  const isLive = () => /^(sk|rk)_live_/.test(cfg("STRIPE_SECRET_KEY"));
  // ---- a sale: for a while, the game at a lower price — the checkout charges it, and on its last day it ends by itself.
  //  The Halloween sale, CA$7.99 (from CA$14.99) to the end of Tuesday 3 November 2026, Pacific time. (SALE_PRICE in
  //  cents and SALE_UNTIL, an ISO time, in the settings file override it, or start another.)
  const SALE = { name: "Halloween sale", cents: 799, currency: "cad", until: "2026-11-04T08:00:00Z", price: "CA$7.99", was: "CA$14.99" };
  const sale = () => {
    const cents = +(cfg("SALE_PRICE") || SALE.cents), until = Date.parse(cfg("SALE_UNTIL") || SALE.until);
    return cents > 0 && Date.now() < until ? { ...SALE, cents, until: new Date(until).toISOString(), price: "CA$" + (cents / 100).toFixed(2) } : null;
  };
  // (the sale's line: the game's own product — it carries the tax code Stripe insists on — at the sale's amount. The
  //  product's found from the regular price, or, when the key may not read prices, from an earlier checkout's line)
  let regular = null;
  const findRegular = async () => {
    try { const pr = await stripe("GET", `/v1/prices/${encodeURIComponent(cfg("STRIPE_PRICE"))}`); return { product: pr.product, tax: pr.tax_behavior, cur: pr.currency }; } catch (e) {}
    for (const sid of Object.keys(book.sessions).reverse().slice(0, 5)) {
      try { const li = await stripe("GET", `/v1/checkout/sessions/${encodeURIComponent(sid)}/line_items?limit=1`), pr = li && li.data && li.data[0] && li.data[0].price; if (pr && pr.product && pr.id === cfg("STRIPE_PRICE")) return { product: pr.product, tax: pr.tax_behavior, cur: pr.currency }; } catch (e) {}
    }
    return null;
  };
  const saleLine = async sl => {
    if (!regular) regular = await findRegular();
    if (!regular) return null;
    return { price_data: { currency: regular.cur || sl.currency, unit_amount: sl.cents, product: regular.product, ...(regular.tax && regular.tax !== "unspecified" ? { tax_behavior: regular.tax } : {}) }, quantity: 1 };
  };

  // ---- the book of keys: on disk, written whole and swapped in, so a crash never leaves half of it ----
  const file = dataDir ? path.join(dataDir, "shop.json") : null;
  let book = { keys: {}, sessions: {}, claims: {} };
  try { if (file && fs.existsSync(file)) book = { keys: {}, sessions: {}, claims: {}, ...JSON.parse(fs.readFileSync(file, "utf8")) }; } catch (e) { log("shop: the book of keys is unreadable:", e.message); }
  const save = () => { if (!file) return; try { fs.mkdirSync(dataDir, { recursive: true }); fs.writeFileSync(file + ".tmp", JSON.stringify(book)); fs.renameSync(file + ".tmp", file); } catch (e) { log("shop: couldn't save the book of keys:", e.message); } };

  // a key: FR- and four groups of five, from letters and digits that can't be mistaken for one another
  const ALPHA = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const mintKey = () => { let k; do { const b = crypto.randomBytes(20); k = "FR" + [0, 1, 2, 3].map(g => "-" + [0, 1, 2, 3, 4].map(i => ALPHA[b[g * 5 + i] % 32]).join("")).join(""); } while (book.keys[k]); return k; };

  // ---- Stripe's API: form-encoded in, JSON out ----
  const form = (o, pre = "", out = []) => {
    for (const [k, v] of Object.entries(o)) {
      if (v == null) continue;
      const key = pre ? `${pre}[${k}]` : k;
      if (typeof v === "object") form(v, key, out); else out.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(v))}`);
    }
    return out.join("&");
  };
  const stripe = (method, p, params = null) => new Promise((ok, no) => {
    const base = new URL(cfg("STRIPE_API_BASE") || "https://api.stripe.com"), body = params ? form(params) : "";
    const lib = base.protocol === "http:" ? http : https;
    const rq = lib.request({ protocol: base.protocol, hostname: base.hostname, port: base.port || undefined, path: p, method, timeout: 15000,
      headers: { Authorization: `Bearer ${cfg("STRIPE_SECRET_KEY")}`, "Content-Type": "application/x-www-form-urlencoded", "Content-Length": Buffer.byteLength(body), "Stripe-Version": "2025-03-31.basil" } }, r => {
      let d = ""; r.on("data", c => d += c); r.on("end", () => { let j = null; try { j = JSON.parse(d); } catch (e) {} if (r.statusCode >= 200 && r.statusCode < 300 && j) ok(j); else no(new Error((j && j.error && j.error.message) || `Stripe answered ${r.statusCode}`)); });
    });
    rq.on("error", no); rq.on("timeout", () => rq.destroy(new Error("Stripe didn't answer")));
    rq.end(body);
  });

  // ---- a checkout: the key made first, and carried by the payment ----
  const cleanUser = u => String(u || "").replace(/[\u0000-\u001f<>]/g, "").trim().slice(0, 32);
  async function checkout(claim = null, user = "") {
    const key = mintKey(), site = SITE();
    // (a sale's line, if there's a sale and its line can be made; if Stripe won't take it, the regular price — a buyer
    //  is never left without a checkout)
    let sl = sale(), line = sl ? await saleLine(sl) : null;
    if (sl && !line) { log("shop: the sale's line couldn't be made (the game's product wasn't found); regular price"); sl = null; }
    const params = line => ({
      mode: "payment",
      line_items: { 0: line || { price: cfg("STRIPE_PRICE"), quantity: 1 } },
      success_url: `${site}?paid={CHECKOUT_SESSION_ID}#buy`,
      cancel_url: `${site}#buy`,
      client_reference_id: key,
      metadata: { licence: key },
      payment_intent_data: { description: `Forester: Reckoning — licence key ${key}`, metadata: { licence: key } },
      allow_promotion_codes: "true",
      ...(cfg("STRIPE_TAX") === "1" ? { automatic_tax: { enabled: "true" } } : {}),
    });
    let s;
    try { s = await stripe("POST", "/v1/checkout/sessions", params(line)); }
    catch (e) { if (!line) throw e; log("shop: Stripe refused the sale's line (" + e.message + "); regular price"); regular = null; sl = null; s = await stripe("POST", "/v1/checkout/sessions", params(null)); }
    book.keys[key] = { s: s.id, at: Date.now(), paid: false, checked: 0, insts: [], ...(cleanUser(user) ? { user: cleanUser(user) } : {}) };
    book.sessions[s.id] = key;
    if (claim) book.claims[claim] = { key, at: Date.now() };
    // (tickets nobody came back for, after a day: forgotten)
    for (const [c, v] of Object.entries(book.claims)) if (Date.now() - v.at > 86400000) delete book.claims[c];
    save();
    log(`shop: checkout opened (${s.id.slice(0, 16)}…, ${((s.amount_total | 0) / 100).toFixed(2)} ${s.currency || ""}${sl ? ", " + sl.name : ""})`);
    return s;
  }

  // is it paid — asked of Stripe (not more than once in a while: every few seconds while it isn't, daily once it is)
  // (a full refund, or a dispute, takes the key back)
  async function paid(key, force = false) {
    const r = book.keys[key]; if (!r) return false;
    const wait = r.paid ? 86400000 : 5000;
    if (!force && Date.now() - (r.checked || 0) < wait) return r.paid && !r.revoked;
    r.checked = Date.now();
    try {
      const s = await stripe("GET", `/v1/checkout/sessions/${encodeURIComponent(r.s)}?expand[]=payment_intent.latest_charge`);
      const was = r.paid;
      r.paid = s.payment_status === "paid" || s.payment_status === "no_payment_required";
      const ch = s.payment_intent && s.payment_intent.latest_charge;
      r.revoked = !!(ch && typeof ch === "object" && (ch.refunded || ch.disputed));
      if (s.customer_details && s.customer_details.email) r.email = s.customer_details.email;
      // (for the sales counter: what was paid, in what, and when — and the buyer's country, nothing more)
      if (r.paid) { r.amt = s.amount_total | 0; r.cur = s.currency || ""; r.paidAt ||= was ? (s.created || 0) * 1000 : Date.now(); const ad = (s.customer_details && s.customer_details.address) || {}; r.cc = ad.country || r.cc || ""; r.region = ad.state || r.region || ""; r.city = ad.city || r.city || ""; }
      if (r.paid && !was) log(`shop: paid — ${key.slice(0, 8)}…`);
      if (s.status === "expired" && !r.paid) r.expired = true;
      save();
    } catch (e) { log("shop: couldn't ask Stripe:", e.message); }
    if (r.paid && !r.revoked) deliver(key);
    return r.paid && !r.revoked;
  }

  // ---- the letter with the key in it: once to each buyer (tried again a few times if the mail server won't take it) ----
  const sending = new Set();
  async function deliver(key) {
    const r = book.keys[key];
    if (!r || !r.paid || r.revoked || r.mailed || !r.email || sending.has(key) || !cfg("SMTP_USER") || !cfg("SMTP_PASS")) return;
    if ((r.mailTries || 0) >= 6 || Date.now() - (r.mailAt || 0) < 60000 * (r.mailTries || 0)) return;
    sending.add(key); r.mailTries = (r.mailTries || 0) + 1; r.mailAt = Date.now();
    const site = SITE(), user = cfg("SMTP_USER");
    const text = `Thank you for buying Forester: Reckoning.

Your licence key:

    ${key}

To unlock the full game: open Forester: Reckoning, choose "Unlock the full game" on the title screen, paste the key, and press Unlock. It works on up to ${MAX_COMPUTERS} computers.

(Bought from inside the game? It has already unlocked itself — keep this key for your other computers.)

The game, and its news: ${site}

Keep this email. If you ever lose your key or need a hand, just reply to it.

— Roan, DeadlyDog Productions`;
    const html = `<!doctype html><html><body style="margin:0;padding:0;background:#e9edf0">
<div style="max-width:520px;margin:0 auto;padding:36px 24px;font:16px/1.55 Georgia,'Times New Roman',serif;color:#25303a">
<p style="margin:0 0 6px;font-size:13px;letter-spacing:.28em;text-transform:uppercase;color:#5a6570">Forester · Reckoning</p>
<h1 style="margin:0 0 18px;font-weight:normal;font-size:26px">Thank you — the game is yours.</h1>
<p style="margin:0 0 10px">Your licence key:</p>
<p style="margin:0 0 22px;padding:16px;border:1px solid #9aa6b0;border-radius:4px;background:#f6f8f9;font:600 20px/1.3 Menlo,Consolas,monospace;letter-spacing:.05em;text-align:center">${key}</p>
<p style="margin:0 0 12px">To unlock it: open Forester: Reckoning, choose <b>Unlock the full game</b> on the title screen, paste the key, and press <b>Unlock</b>. It works on up to ${MAX_COMPUTERS} computers.</p>
<p style="margin:0 0 12px;color:#4a5661">Bought from inside the game? It has already unlocked itself — keep this key for your other computers.</p>
<p style="margin:0 0 24px"><a href="${site}" style="color:#2f5266">The game's page</a></p>
<p style="margin:0;color:#5a6570;font-size:14px">Keep this email. If you ever lose your key or need a hand, just reply to it.<br>— Roan, DeadlyDog Productions</p>
</div></body></html>`;
    try {
      await mailer.send({ host: cfg("SMTP_HOST") || "smtp.gmail.com", port: cfg("SMTP_PORT") || 465, secure: cfg("SMTP_TLS") !== "0", user, pass: cfg("SMTP_PASS"),
        from: cfg("SMTP_FROM") || user, fromName: "DeadlyDog Productions", to: r.email, subject: "Your Forester: Reckoning licence key", text, html });
      r.mailed = Date.now(); log(`shop: key emailed — ${key.slice(0, 8)}…`);
    } catch (e) { log("shop: couldn't email the key:", e.message); }
    sending.delete(key); save();
  }
  // (every minute: Stripe's checkouts finished in the last two days, any of ours not yet known paid, or not yet emailed)
  async function sweep() {
    if (!isOn()) return;
    try {
      const since = Math.floor(Date.now() / 1000) - 2 * 86400;
      const l = await stripe("GET", `/v1/checkout/sessions?status=complete&limit=100&created[gte]=${since}`);
      for (const s of l.data || []) {
        const key = book.sessions[s.id], r = key && book.keys[key]; if (!r) continue;
        if (s.customer_details && s.customer_details.email && !r.email) r.email = s.customer_details.email;
        if (!r.paid) await paid(key, true); else deliver(key);
      }
    } catch (e) { if (!/couldn't reach|ENOTFOUND|ETIMEDOUT/.test(e.message)) log("shop: the sweep:", e.message); }
  }
  setInterval(sweep, 60000).unref(); setTimeout(sweep, 5000).unref();

  // ---- the keys, as the game asks after them (answered in the shape Lemon Squeezy's licence API uses, which the game
  //      already understands) ----
  async function licence(op, key, inst, name, user = "") {
    key = String(key || "").trim().toUpperCase();
    if (!KEY_RX.test(key)) return null;
    const r = book.keys[key];
    if (!r) return { activated: false, valid: false, error: "license_key not found" };
    // (a key bought on the website: whose it is, learned when it's first put into the game)
    if (op === "activate" && cleanUser(user) && !r.user) { r.user = cleanUser(user); save(); }
    const good = await paid(key, op === "activate" && !r.paid);
    if (r.revoked) return { activated: false, valid: false, error: "license_key disabled" };
    if (!good) return { activated: false, valid: false, error: r.expired ? "license_key not found" : "payment not finished yet" };
    const meta = { store_id: 0, product_id: 0 };
    if (op === "activate") {
      if (r.insts.length >= MAX_COMPUTERS) return { activated: false, error: "activation limit reached", license_key: { status: "active" } };
      const id = crypto.randomBytes(9).toString("hex"); r.insts.push({ id, name: String(name || "").slice(0, 60), at: Date.now() }); save();
      return { activated: true, instance: { id }, meta, license_key: { status: "active", activation_limit: MAX_COMPUTERS, activation_usage: r.insts.length } };
    }
    if (op === "validate") return { valid: !inst || r.insts.some(i => i.id === inst), meta, license_key: { status: "active" } };
    if (op === "deactivate") { r.insts = r.insts.filter(i => i.id !== inst); save(); return { deactivated: true, meta }; }
    return { error: "bad request" };
  }

  // ---- the routes ----
  const asks = new Map();
  const tooMany = (req, kind, n, ms) => { const ip = ipOf(req), k = kind + ip, t = Date.now(), l = (asks.get(k) || []).filter(x => t - x < ms); l.push(t); asks.set(k, l); return l.length > n; };
  const json = (res, code, o) => { res.statusCode = code; res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify(o)); };
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const page = (res, code, title, body) => {
    res.statusCode = code; res.setHeader("Content-Type", "text/html; charset=utf-8"); res.setHeader("Cache-Control", "no-store"); res.setHeader("Referrer-Policy", "no-referrer");
    res.end(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${esc(title)} — Forester: Reckoning</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#10140f;color:#e8e2d0;font:16px/1.5 Georgia,serif}main{max-width:560px;padding:32px 20px;text-align:center}h1{font-weight:normal;letter-spacing:.04em;margin:0 0 8px}p{color:#bdb6a2}
.key{margin:22px 0;padding:16px;border:1px solid #c8a24a;border-radius:4px;font:600 clamp(16px,4.6vw,24px)/1.3 ui-monospace,Menlo,Consolas,monospace;letter-spacing:.06em;color:#f2dc96;user-select:all;word-break:break-all}
button,a.b{display:inline-block;margin:4px;padding:9px 16px;border:1px solid #c8a24a;border-radius:3px;background:#2a3a24;color:#f2e8c8;font:inherit;cursor:pointer;text-decoration:none}small{color:#8f8a7c}</style></head><body><main>${body}</main></body></html>`);
  };

  // ---- the sales counter, for the shop's keeper alone: a token kept in the data folder (made the first time it's asked
  //      for), never the Stripe key. Counts, takings and the last sales — no keys, no emails ----
  const tokenFile = dataDir ? path.join(dataDir, "sales.token") : null;
  const salesToken = () => { try { return tokenFile && fs.existsSync(tokenFile) ? fs.readFileSync(tokenFile, "utf8").trim() : ""; } catch (e) { return ""; } };
  const tokenOk = t => { const want = salesToken(); if (!want || !t) return false; const a = Buffer.from(String(t)), b = Buffer.from(want); return a.length === b.length && crypto.timingSafeEqual(a, b); };
  // (only the sales of the mode the shop is in: the test purchases made before it went live aren't sales)
  const ofMode = r => /^cs_live_/.test(r.s || "") === isLive();
  let backfilling = false;
  async function backfill() {
    // (sales from before the counter: what they came to, asked of Stripe a few at a time)
    if (backfilling || !isOn()) return; backfilling = true;
    try { let n = 0; for (const [k, r] of Object.entries(book.keys)) { if (!r.paid || r.amt != null || !ofMode(r)) continue; if (n++ >= 5) break; await paid(k, true); } } finally { backfilling = false; }
  }
  function sales() {
    const all = Object.values(book.keys).filter(ofMode), L = all.filter(r => r.paid), day = Date.now() - 86400000, week = Date.now() - 7 * 86400000, gross = {}, net = {};
    for (const r of L) { if (r.amt == null) continue; const c = (r.cur || "?").toUpperCase(); gross[c] = (gross[c] || 0) + r.amt; if (!r.revoked) net[c] = (net[c] || 0) + r.amt; }
    const when = r => r.paidAt || r.at || 0;
    return {
      sold: L.filter(r => !r.revoked).length, refunded: L.filter(r => r.revoked).length, gross, net,
      today: L.filter(r => !r.revoked && when(r) >= day).length, week: L.filter(r => !r.revoked && when(r) >= week).length,
      opened: all.length, live: isLive(), on: isOn(),
      last: L.sort((a, b) => when(b) - when(a)).slice(0, 12).map(r => ({ at: when(r), amt: r.amt ?? null, cur: (r.cur || "").toUpperCase(), cc: r.cc || "", region: r.region || "", city: r.city || "", user: r.user || "", used: (r.insts || []).length, refunded: !!r.revoked })),
      now: Date.now(),
    };
  }
  async function handle(u, req, res) {
    const p = u.pathname;
    if (p === "/shop/status") return json(res, 200, { on: isOn(), live: isLive(), sale: sale() }), true;
    if (p === "/shop/sales") {
      if (tooMany(req, "x", 30, 60000)) return json(res, 429, { error: "too many" }), true;
      if (!tokenOk(u.searchParams.get("t"))) return json(res, 403, { error: "no" }), true;
      res.setHeader("Cache-Control", "no-store"); backfill(); return json(res, 200, sales()), true;
    }
    if (!p.startsWith("/shop/")) return false;
    if (!isOn()) { if (p === "/shop/buy" || p === "/shop/key") page(res, 503, "The shop isn't open yet", `<h1>The shop isn't open yet</h1><p>Forester: Reckoning can't be bought just yet. Check back soon.</p>`); else json(res, 503, { error: "the shop isn't open" }); return true; }
    try {
      if (p === "/shop/start") {
        if (tooMany(req, "s", 8, 600000)) return json(res, 429, { error: "too many" }), true;
        const claim = crypto.randomBytes(18).toString("hex"), s = await checkout(claim, u.searchParams.get("u"));
        return json(res, 200, { url: s.url, claim }), true;
      }
      if (p === "/shop/buy") {
        if (tooMany(req, "s", 8, 600000)) return page(res, 429, "One moment", `<h1>One moment</h1><p>That's a lot of checkouts at once. Try again in a few minutes.</p>`), true;
        const s = await checkout();
        res.statusCode = 303; res.setHeader("Location", s.url); res.setHeader("Content-Type", "text/plain"); res.end("To the checkout…"); return true;
      }
      if (p === "/shop/claim") {
        if (tooMany(req, "c", 40, 60000)) return json(res, 429, { error: "too many" }), true;
        const c = book.claims[String(u.searchParams.get("c") || "")];
        if (!c) return json(res, 404, { state: "gone" }), true;
        const r = book.keys[c.key], ok = await paid(c.key);
        if (ok) return json(res, 200, { state: "paid", key: c.key }), true;
        return json(res, 200, { state: r && (r.expired || r.revoked) ? "gone" : "pending" }), true;
      }
      if (p === "/shop/key") {
        if (tooMany(req, "k", 30, 60000)) return page(res, 429, "One moment", `<h1>One moment</h1><p>Try again in a minute.</p>`), true;
        const sid = String(u.searchParams.get("s") || ""), key = /^cs_(test|live)_[A-Za-z0-9]{10,200}$/.test(sid) && book.sessions[sid];
        if (!key) return page(res, 404, "Not found", `<h1>We can't find that purchase</h1><p>If you've paid and see this, write to <a class="b" href="mailto:${esc(contact())}">${esc(contact())}</a> with the email you paid with — your key is also in the description on your Stripe receipt.</p>`), true;
        const ok = await paid(key, true), r = book.keys[key];
        if (r.revoked) return page(res, 200, "Refunded", `<h1>This purchase was refunded</h1><p>Its key no longer unlocks the game.</p>`), true;
        if (!ok) return page(res, 200, "Almost there", `<h1>Almost there</h1><p>Stripe hasn't confirmed the payment yet. This page will look again in a few seconds.</p><script>setTimeout(()=>location.reload(),4000)</script>`), true;
        return page(res, 200, "Thank you", `<h1>Thank you</h1><p>Forester: Reckoning is yours. Here's your licence key:</p><div class="key" id="k">${esc(key)}</div>
<button id="cp">Copy the key</button>
<script>document.getElementById("cp").onclick=function(){var k=document.getElementById("k"),b=this,done=function(){b.textContent="Copied"};
// (a plain-http page has no clipboard API: the key selected and copied the old way instead)
if(navigator.clipboard&&window.isSecureContext){navigator.clipboard.writeText(k.textContent).then(done);return}
var r=document.createRange();r.selectNodeContents(k);var s=getSelection();s.removeAllRanges();s.addRange(r);try{if(document.execCommand("copy"))done();else b.textContent="Selected — press Cmd+C"}catch(e){b.textContent="Selected — press Cmd+C"}};</script>
<p>In the game: <b>Unlock the full game</b> on the title screen, paste the key, and <b>Unlock</b>. It works on up to ${MAX_COMPUTERS} computers. It's also in the description on your emailed receipt — keep it.</p>
<p><a class="b" href="${esc(SITE())}">Back to the game's page</a></p><small>Lost it later? Write to ${esc(contact())} with the email you paid with.</small>`), true;
      }
    } catch (e) {
      log("shop:", e.message);
      if (p === "/shop/buy" || p === "/shop/key") page(res, 502, "Something went wrong", `<h1>Something went wrong</h1><p>The payment page couldn't be reached just now — nothing was charged. Try again in a moment.</p>`);
      else json(res, 502, { error: "the shop couldn't reach Stripe" });
      return true;
    }
    json(res, 404, {}); return true;
  }

  return { handle, licence, isOn, isLive, sweep, tokenOk, _book: () => book };
};
