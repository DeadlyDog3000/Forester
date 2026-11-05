// A TEST, not part of the game: how long a frame takes. Plays a chapter, steps it by hand, then times n frames of the
// world alone and n drawn (waited on with a one-pixel read, so the graphics card's time is in it too).
// Set globalThis.RB = { chapter, warm, n } and eval it in the dev server's page; the result lands in window.__rb.
// The page's own save slots are put back as they were afterwards.
(async () => {
  const O = Object.assign({ chapter: 6, warm: 400, n: 120, who: "brother" }, globalThis.RB || {});
  const ch = new MessageChannel(), waiting = []; ch.port1.onmessage = () => { const r = waiting.shift(); r && r(); };
  const breath = () => new Promise(r => { waiting.push(r); ch.port2.postMessage(0); });
  const E = await import("/reckoning/js/engine.js"), G = E.G;
  const { UI } = await import("/reckoning/js/ui.js");
  const { renderer } = await import("/reckoning/js/core.js");
  const errs = []; addEventListener("error", e => errs.push(e.message));
  // (the test browser's own save slots are kept as they were: whatever the chapter autosaves is put back after)
  const keep = {}; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (/^reckoning\.save/.test(k)) keep[k] = localStorage.getItem(k); }
  const restore = () => { for (let i = localStorage.length - 1; i >= 0; i--) { const k = localStorage.key(i); if (/^reckoning\.save/.test(k) && !(k in keep)) localStorage.removeItem(k); } for (const k in keep) if (localStorage.getItem(k) !== keep[k]) localStorage.setItem(k, keep[k]); };
  window.__manual = true;
  if (O.chapter) window.__play(O.chapter, O.who);
  for (let i = 0; i < O.warm; i++) { E.frame(1 / 30, i % 10 !== 9); if (UI.dialogOpen && UI._advance) UI._advance(); if (i % 10 === 0) await breath(); }
  const gl = renderer.getContext(), px = new Uint8Array(4), sync = () => gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
  const time = (skip) => { const a = []; for (let i = 0; i < O.n; i++) { const t = performance.now(); E.frame(1 / 60, skip); if (!skip) sync(); a.push(performance.now() - t); } a.sort((x, y) => x - y); return { med: +a[a.length >> 1].toFixed(2), p90: +a[Math.floor(a.length * 0.9)].toFixed(2) }; };
  const sim = time(true); await breath();
  const full = time(false);
  renderer.info.autoReset = false; renderer.info.reset(); E.frame(1 / 60, false); const info = { calls: renderer.info.render.calls, triangles: renderer.info.render.triangles }; renderer.info.autoReset = true;
  const w = G.world;
  restore();
  window.__rb = { kept: Object.keys(keep).length, chapter: O.chapter, mode: G.mode, sim, full, calls: info.calls, tris: info.triangles, geos: renderer.info.memory.geometries, tex: renderer.info.memory.textures, progs: renderer.info.programs.length, actors: w && w.actors.length, q: G.settings.quality, size: [renderer.domElement.width, renderer.domElement.height], errs: errs.slice(0, 3) };
})().catch(e => { window.__rb = { err: String(e.stack || e) }; });
