// ===========================================================================
//  FORESTER: RECKONING — Copyright (c) 2026 Roan Fraese / DeadlyDog Productions
// ===========================================================================

// KEEPING THE SAVES: everything the game keeps — your games, who you are online, your records — lives in the window's
// local storage, and if that were ever lost it would all go at once, and the game would greet you as a stranger. So in
// the app a copy of all of it is sent out to a file of the app's own every minute (and as the window closes), and if
// the game starts and finds its storage wiped where that copy is not, it takes everything back from the copy before
// anything else is read. (A plain script, run before the game's modules, so nothing has read the storage yet.)
(function () {
  const K = window.reckoningKeep; if (!K || !K.read) return;
  const ID = "reckoning.keep.id";
  let kept = null; try { const t = K.read(); kept = t ? JSON.parse(t) : null; } catch (e) { kept = null; }
  try {
    // (this storage never had a mark of its own, but the copy has one: it was wiped — put it all back)
    if (!localStorage.getItem(ID) && kept && kept.keys && kept.keys[ID]) {
      let n = 0; for (const [k, v] of Object.entries(kept.keys)) { try { localStorage.setItem(k, v); n++; } catch (e) {} }
      window.__keptRestored = { n, at: kept.at || 0 };
    }
    if (!localStorage.getItem(ID)) localStorage.setItem(ID, Date.now().toString(36) + Math.random().toString(36).slice(2));
  } catch (e) {}
  let last = "";
  const snap = () => {
    try {
      const keys = {};
      for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && k.startsWith("reckoning.")) keys[k] = localStorage.getItem(k); }
      if (!keys[ID]) return;
      const body = JSON.stringify(keys); if (body === last) return; last = body;
      K.write(`{"v":1,"at":${Date.now()},"keys":${body}}`);
    } catch (e) {}
  };
  setTimeout(snap, 20000); setInterval(snap, 60000);
  addEventListener("pagehide", snap); document.addEventListener("visibilitychange", () => { if (document.hidden) snap(); });
  // (said, once the page is up, if it was needed)
  if (window.__keptRestored) addEventListener("DOMContentLoaded", () => {
    const d = document.createElement("div"), when = window.__keptRestored.at ? new Date(window.__keptRestored.at).toLocaleString() : "earlier";
    d.textContent = `Your saves were missing from the game's storage, so they've been brought back from the app's own copy (${when}).`;
    d.style.cssText = "position:fixed;left:50%;top:18px;transform:translateX(-50%);z-index:9999;max-width:min(640px,90vw);padding:10px 16px;background:rgba(12,22,15,.95);color:#f0e6cc;border:1px solid #c9a24a;border-radius:4px;font:14px/1.4 sans-serif;box-shadow:0 6px 24px rgba(0,0,0,.5)";
    document.body.appendChild(d); setTimeout(() => d.remove(), 12000);
  });
})();
