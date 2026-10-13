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
//   GET /shop/status          { on, live }                    — is the shop open
//   GET /shop/start           { url, claim }                  — from the game: a checkout, and a ticket to claim its key
//   GET /shop/claim?c=        { state: pending|paid|gone, key }  — the game asking whether it's paid yet
//   GET /shop/buy             303 → Stripe Checkout           — from the website's Buy button
//   GET /shop/key?s=cs_…      a page with the key             — the website's thank-you page links here
//   licence(op, key, …)       activate / validate / deactivate one of our keys (FR-…), for /licence
//
// The secrets live in a file beside the server's data, never in the code: STRIPE_SECRET_KEY (a restricted key will
// do: Checkout Sessions write, Payment Intents and Charges read) and STRIPE_PRICE (the price_… of the game). It's read
// again whenever it changes, so setting it needs no restart.

const fs = require("fs"), path = require("path"), crypto = require("crypto"), https = require("https"), http = require("http");

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
  const isOn = () => !!(cfg("STRIPE_SECRET_KEY") && cfg("STRIPE_PRICE"));
  const isLive = () => /^(sk|rk)_live_/.test(cfg("STRIPE_SECRET_KEY"));

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
      headers: { Authorization: `Bearer ${cfg("STRIPE_SECRET_KEY")}`, "Content-Type": "application/x-www-form-urlencoded", "Content-Length": Buffer.byteLength(body), "Stripe-Version": "2024-06-20" } }, r => {
      let d = ""; r.on("data", c => d += c); r.on("end", () => { let j = null; try { j = JSON.parse(d); } catch (e) {} if (r.statusCode >= 200 && r.statusCode < 300 && j) ok(j); else no(new Error((j && j.error && j.error.message) || `Stripe answered ${r.statusCode}`)); });
    });
    rq.on("error", no); rq.on("timeout", () => rq.destroy(new Error("Stripe didn't answer")));
    rq.end(body);
  });

  // ---- a checkout: the key made first, and carried by the payment ----
  async function checkout(claim = null) {
    const key = mintKey(), site = SITE();
    const s = await stripe("POST", "/v1/checkout/sessions", {
      mode: "payment",
      line_items: { 0: { price: cfg("STRIPE_PRICE"), quantity: 1 } },
      success_url: `${site}?paid={CHECKOUT_SESSION_ID}#buy`,
      cancel_url: `${site}#buy`,
      client_reference_id: key,
      metadata: { licence: key },
      payment_intent_data: { description: `Forester: Reckoning — licence key ${key}`, metadata: { licence: key } },
      custom_text: { submit: { message: "Your licence key is shown as soon as you've paid, and it's on your receipt. Bought from inside the game? It unlocks by itself." } },
      allow_promotion_codes: "true",
      ...(cfg("STRIPE_TAX") === "1" ? { automatic_tax: { enabled: "true" } } : {}),
    });
    book.keys[key] = { s: s.id, at: Date.now(), paid: false, checked: 0, insts: [] };
    book.sessions[s.id] = key;
    if (claim) book.claims[claim] = { key, at: Date.now() };
    // (tickets nobody came back for, after a day: forgotten)
    for (const [c, v] of Object.entries(book.claims)) if (Date.now() - v.at > 86400000) delete book.claims[c];
    save();
    log(`shop: checkout opened (${s.id.slice(0, 16)}…)`);
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
      if (r.paid && !was) log(`shop: paid — ${key.slice(0, 8)}…`);
      if (s.status === "expired" && !r.paid) r.expired = true;
      save();
    } catch (e) { log("shop: couldn't ask Stripe:", e.message); }
    return r.paid && !r.revoked;
  }

  // ---- the keys, as the game asks after them (answered in the shape Lemon Squeezy's licence API uses, which the game
  //      already understands) ----
  async function licence(op, key, inst, name) {
    key = String(key || "").trim().toUpperCase();
    if (!KEY_RX.test(key)) return null;
    const r = book.keys[key];
    if (!r) return { activated: false, valid: false, error: "license_key not found" };
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
  const tooMany = (req, kind, n, ms) => { const ip = (req.socket && req.socket.remoteAddress) || "x", k = kind + ip, t = Date.now(), l = (asks.get(k) || []).filter(x => t - x < ms); l.push(t); asks.set(k, l); return l.length > n; };
  const json = (res, code, o) => { res.statusCode = code; res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify(o)); };
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const page = (res, code, title, body) => {
    res.statusCode = code; res.setHeader("Content-Type", "text/html; charset=utf-8"); res.setHeader("Cache-Control", "no-store"); res.setHeader("Referrer-Policy", "no-referrer");
    res.end(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${esc(title)} — Forester: Reckoning</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#10140f;color:#e8e2d0;font:16px/1.5 Georgia,serif}main{max-width:560px;padding:32px 20px;text-align:center}h1{font-weight:normal;letter-spacing:.04em;margin:0 0 8px}p{color:#bdb6a2}
.key{margin:22px 0;padding:16px;border:1px solid #c8a24a;border-radius:4px;font:600 clamp(16px,4.6vw,24px)/1.3 ui-monospace,Menlo,Consolas,monospace;letter-spacing:.06em;color:#f2dc96;user-select:all;word-break:break-all}
button,a.b{display:inline-block;margin:4px;padding:9px 16px;border:1px solid #c8a24a;border-radius:3px;background:#2a3a24;color:#f2e8c8;font:inherit;cursor:pointer;text-decoration:none}small{color:#8f8a7c}</style></head><body><main>${body}</main></body></html>`);
  };

  async function handle(u, req, res) {
    const p = u.pathname;
    if (p === "/shop/status") return json(res, 200, { on: isOn(), live: isLive() }), true;
    if (!p.startsWith("/shop/")) return false;
    if (!isOn()) { if (p === "/shop/buy" || p === "/shop/key") page(res, 503, "The shop isn't open yet", `<h1>The shop isn't open yet</h1><p>Forester: Reckoning can't be bought just yet. Check back soon.</p>`); else json(res, 503, { error: "the shop isn't open" }); return true; }
    try {
      if (p === "/shop/start") {
        if (tooMany(req, "s", 8, 600000)) return json(res, 429, { error: "too many" }), true;
        const claim = crypto.randomBytes(18).toString("hex"), s = await checkout(claim);
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
        if (!key) return page(res, 404, "Not found", `<h1>We can't find that purchase</h1><p>If you've paid and see this, write to <a class="b" href="mailto:deadlydogdev@gmail.com">deadlydogdev@gmail.com</a> with the email you paid with — your key is also in the description on your Stripe receipt.</p>`), true;
        const ok = await paid(key, true), r = book.keys[key];
        if (r.revoked) return page(res, 200, "Refunded", `<h1>This purchase was refunded</h1><p>Its key no longer unlocks the game.</p>`), true;
        if (!ok) return page(res, 200, "Almost there", `<h1>Almost there</h1><p>Stripe hasn't confirmed the payment yet. This page will look again in a few seconds.</p><script>setTimeout(()=>location.reload(),4000)</script>`), true;
        return page(res, 200, "Thank you", `<h1>Thank you</h1><p>Forester: Reckoning is yours. Here's your licence key:</p><div class="key" id="k">${esc(key)}</div>
<button onclick="navigator.clipboard&&navigator.clipboard.writeText(document.getElementById('k').textContent).then(()=>this.textContent='Copied')">Copy the key</button>
<p>In the game: <b>Unlock the full game</b> on the title screen, paste the key, and <b>Unlock</b>. It works on up to ${MAX_COMPUTERS} computers. It's also in the description on your emailed receipt — keep it.</p>
<p><a class="b" href="${esc(SITE())}">Back to the game's page</a></p><small>Lost it later? Write to deadlydogdev@gmail.com with the email you paid with.</small>`), true;
      }
    } catch (e) {
      log("shop:", e.message);
      if (p === "/shop/buy" || p === "/shop/key") page(res, 502, "Something went wrong", `<h1>Something went wrong</h1><p>The payment page couldn't be reached just now — nothing was charged. Try again in a moment.</p>`);
      else json(res, 502, { error: "the shop couldn't reach Stripe" });
      return true;
    }
    json(res, 404, {}); return true;
  }

  return { handle, licence, isOn, isLive, _book: () => book };
};
