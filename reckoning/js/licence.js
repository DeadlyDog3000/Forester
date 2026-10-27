// ===========================================================================
//  FORESTER: RECKONING — Copyright (c) 2026 Roan Fraese / DeadlyDog Productions
// ===========================================================================

// THE DEMO AND THE FULL GAME. Free: Part One of the story (its first six chapters, to "Ashes"), and nothing else. The full game: the rest of the
// story, battles, duels and the campaign (against the bots or other players), and the Worlds & colonies. Bought through Stripe's
// checkout, opened by the game's own server (server/shop.cjs), which makes the licence key, and gives it to the game
// the moment the payment's through — so a purchase from inside the game unlocks it by itself. A key is entered by
// hand on another computer (or bought from the website), checked with the server, and kept. (Lemon Squeezy's keys
// still work too, checked with Lemon Squeezy: that was the first shop.)
//
// Whoever played before the shop opened — a save, or a record in battle — is an alpha supporter, and keeps the full
// game for nothing. Until SALES_OPEN, nothing is locked at all.

import { G } from "./engine.js";

export const SHOP = {
  // GOING LIVE: once the server's shop is set up with Stripe (its secret key and price, in the server's stripe.env —
  // never here) and a test purchase has gone through, open: true. Then the demo locks and the Buy buttons sell.
  open: true,
  server: "http://45.76.245.44:47810",
  // (Lemon Squeezy, the first shop: its checkout link and ids, if it's ever used again — a key from any other product or
  //  shop isn't ours)
  checkout: "",
  storeId: 0, productId: 0,
  // (the game's page, where the buy box is: what the Buy button opens until there's a checkout link of its own)
  url: "https://deadlydog3000.github.io/deadlydog-productions/reckoning.html#buy",
  price: "CA$14.99",
  // (a sale: the server's checkout charges it while it lasts — this only says so on the Buy page, and stops saying so
  //  when it ends)
  sale: { name: "Halloween sale", price: "CA$7.99", until: Date.parse("2026-11-04T08:00:00Z"), ends: "Tuesday 3 November" },
};
export const saleOn = () => !!(SHOP.sale && Date.now() < SHOP.sale.until);
export const SALES_OPEN = !!SHOP.open;
export const buyUrl = () => SHOP.checkout || SHOP.url;
const KEY = "reckoning.licence.v1";
const read = () => { try { return JSON.parse(localStorage.getItem(KEY)) || null; } catch (e) { return null; } };
const write = v => { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch (e) {} };

// (an alpha supporter: anyone who'd played before the shop opened — marked now, while it's still shut)
(function founder() {
  if (SALES_OPEN || read()) return;
  let played = false;
  try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (/^reckoning\.save\.v1|^reckoning\.pvp\.record$|^reckoning\.mp\.look/.test(k)) { played = true; break; } } } catch (e) {}
  if (played) write({ founder: true, at: Date.now() });
})();

// the full game, or the demo
export function full() {
  if (!SALES_OPEN && !window.__demoTest) return true;
  const L = read();
  return !!(L && (L.founder || (L.key && L.ok)));
}
export const licence = () => read();

// a key, sent to the shop: { ok, why }
async function ask(op, params) {
  const form = new URLSearchParams(params).toString();
  const direct = async () => { const r = await fetch(`https://api.lemonsqueezy.com/v1/licenses/${op}`, { method: "POST", headers: { Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" }, body: form }); return r.json(); };
  const relayed = async () => { const q = new URLSearchParams({ op, key: params.license_key, inst: params.instance_id || "", name: params.instance_name || "", user: userName() }); const r = await fetch(`${SHOP.server}/licence?${q}`); return r.json(); };
  // (the shop's own keys: only the server knows them)
  if (/^FR-/i.test(params.license_key)) return await relayed();
  try { return await direct(); } catch (e) { return await relayed(); }
}

// ---- buying it from inside the game: Stripe's checkout opened in the browser, and the game watching for the payment ----
// (the ticket is kept, so a game closed while its buyer pays still unlocks when it's opened again)
const CLAIM = "reckoning.shop.claim";
// (the name the player goes by online, if they've chosen one: told to the shop with a purchase, so its keeper knows who bought)
const userName = () => { try { return (localStorage.getItem("reckoning.mp.user") || "").slice(0, 32); } catch (e) { return ""; } };
export async function startPurchase() {
  // (in a browser, the tab opened at the click — before the wait for the server — or it'd be taken for a pop-up; the app
  //  opens the checkout in the real browser instead, and has no tab to open here)
  let tab = null; try { tab = window.open("", "_blank"); } catch (e) {}
  const u = userName(), r = await fetch(`${SHOP.server}/shop/start${u ? `?u=${encodeURIComponent(u)}` : ""}`).then(r => r.json()).catch(() => null);
  if (!r || !r.url) { try { tab && tab.close(); } catch (e) {} return { ok: false, why: "Couldn't reach the shop. Are you online? Try again in a moment." }; }
  try { localStorage.setItem(CLAIM, JSON.stringify({ c: r.claim, at: Date.now() })); } catch (e) {}
  if (tab && !tab.closed) tab.location.href = r.url; else window.open(r.url, "_blank");
  return { ok: true };
}
// waiting for it: every few seconds for as long as a checkout stays open (a day at most). onKey(key) once it's paid
let watching = null;
export function watchPurchase(onKey) {
  let T; try { T = JSON.parse(localStorage.getItem(CLAIM) || "null"); } catch (e) { T = null; }
  if (!T || !T.c || Date.now() - T.at > 86400000 || watching === T.c) return false;
  watching = T.c;
  const look = async () => {
    if (watching !== T.c) return;
    const r = await fetch(`${SHOP.server}/shop/claim?c=${encodeURIComponent(T.c)}`).then(r => r.json()).catch(() => null);
    if (r && r.state === "paid" && r.key) {
      try { localStorage.removeItem(CLAIM); } catch (e) {}
      watching = null; const a = await activate(r.key); onKey(r.key, a); return;
    }
    if (r && r.state === "gone") { try { localStorage.removeItem(CLAIM); } catch (e) {} watching = null; return; }
    setTimeout(look, document.hidden ? 8000 : 3500);
  };
  look();
  return true;
}
const ours = j => !SHOP.storeId || !j.meta || (j.meta.store_id === SHOP.storeId && (!SHOP.productId || j.meta.product_id === SHOP.productId));
export async function activate(key) {
  key = String(key || "").trim();
  if (!/^[A-Za-z0-9-]{8,80}$/.test(key)) return { ok: false, why: "That doesn't look like a licence key — it's in the email from the shop, letters and numbers in groups." };
  let j;
  try { j = await ask("activate", { license_key: key, instance_name: `Forester Reckoning · ${navigator.platform || "computer"}` }); }
  catch (e) { return { ok: false, why: "Couldn't reach the shop to check it. Are you online? Try again in a moment." }; }
  if (j && j.activated && ours(j)) { write({ key, inst: j.instance && j.instance.id, ok: true, at: Date.now(), checked: Date.now() }); return { ok: true }; }
  const err = (j && (j.error || (j.license_key && j.license_key.status))) || "";
  return { ok: false, why: /limit/i.test(err) ? "That key's already in use on as many computers as it allows. Free one up from the shop's email, or get in touch." : /expired|disabled/i.test(err) ? "That key has been switched off at the shop." : !ours(j || {}) ? "That key is for something else, not Forester: Reckoning." : "The shop doesn't know that key. Check it against the email — it's easy to miss a character." };
}
// (now and then, on the way in, the key checked again — but a game offline keeps what it has)
export async function recheck() {
  const L = read(); if (!L || !L.key || Date.now() - (L.checked || 0) < 7 * 86400000) return;
  try { const j = await ask("validate", { license_key: L.key, instance_id: L.inst || "" }); if (j && typeof j.valid === "boolean") write({ ...L, ok: j.valid, checked: Date.now() }); } catch (e) {}
}

// what the demo holds back, by name, and the page that offers the rest (main.js builds it)
export const LOCKED = { story: "the rest of the story", online: "battles, duels and the campaign", worlds: "the Worlds & colonies" };
export function gate(what) {
  if (full()) return true;
  G.openBuy && G.openBuy(what);
  return false;
}
