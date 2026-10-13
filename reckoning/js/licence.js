// ===========================================================================
//  FORESTER: RECKONING — Copyright (c) 2026 Roan Fraese / DeadlyDog Productions
// ===========================================================================

// THE DEMO AND THE FULL GAME. Free: the story's first chapter, and battles and duels against the bots. The full game:
// the rest of the story, battles and duels against other players, and the Worlds & colonies. Bought from the shop,
// which sends a licence key; the key is entered once here, checked with the shop (Lemon Squeezy's licence API —
// directly, or through the game's own server if the shop won't answer the game), and kept.
//
// Whoever played before the shop opened — a save, or a record in battle — is an alpha supporter, and keeps the full
// game for nothing. Until SALES_OPEN, nothing is locked at all.

import { G } from "./engine.js";

export const SHOP = {
  // GOING LIVE: the three things from the shop — its checkout link (Products → the product → Share), the store's ID
  // (Settings → Stores) and the product's ID (on the product's page). All three set, and the shop is open: the demo
  // locks, the Buy buttons sell, and only keys for this product in this store unlock it. None of them is a secret.
  checkout: "",
  storeId: 0, productId: 0,
  // (the game's page, where the buy box is: what the Buy button opens until there's a checkout link of its own)
  url: "https://deadlydog3000.github.io/deadlydog-productions/reckoning.html#buy",
  price: "CA$19.99",
  relay: "http://45.76.245.44:47810/licence",
};
export const SALES_OPEN = !!(SHOP.checkout && SHOP.storeId && SHOP.productId);
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
  const relayed = async () => { const q = new URLSearchParams({ op, key: params.license_key, inst: params.instance_id || "", name: params.instance_name || "" }); const r = await fetch(`${SHOP.relay}?${q}`); return r.json(); };
  try { return await direct(); } catch (e) { return await relayed(); }
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
export const LOCKED = { story: "the rest of the story", online: "battles and duels against other players", worlds: "the Worlds & colonies" };
export function gate(what) {
  if (full()) return true;
  G.openBuy && G.openBuy(what);
  return false;
}
