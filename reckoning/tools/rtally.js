// A TEST, not part of the game: where a frame's draws go. Plays a chapter (globalThis.TCH, default 5) in the dev server's
// page, steps it by hand, then tallies one frame's draw calls and triangles by pass (the sun's shadow told apart by its
// depth material) and by object. Fetch it and eval it in the probe tab; the result lands in window.__tres.
// The page's own save slots are put back as they were afterwards.
globalThis.RB = { chapter: globalThis.TCH || 5, warm: 900, n: 150 };
window.__tres = null; (async () => {
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
  // (where the draw calls go: each one tallied by the pass it's in and the object's name or its parents')
  const tris = new Map(), tally = new Map(), passes = new Map(); let pass = "?";
  const oRender = renderer.render.bind(renderer), oRBD = renderer.renderBufferDirect.bind(renderer);
  renderer.render = (sc, cam) => { pass = (sc.name || sc.type) + ":" + (cam.type || "") + (renderer.getRenderTarget() ? ":rt" : ""); return oRender(sc, cam); };
  renderer.renderBufferDirect = (cam, sc, geo, mat, obj, grp) => {
    const shadow = mat && (mat.isMeshDepthMaterial || mat.isMeshDistanceMaterial || /depth/i.test(mat.type));
    const p = shadow ? "shadow:" + cam.type + ":" + cam.uuid.slice(0, 4) : pass; passes.set(p, (passes.get(p) || 0) + 1);
    let o = obj, nm = ""; for (let i = 0; i < 4 && o && !nm; i++) { nm = o.name || o.userData?.kind || ""; o = o.parent; }
    const k = (shadow ? "S " : "") + (nm || (obj.isInstancedMesh ? "inst" + (geo.attributes.position ? geo.attributes.position.count : 0) + "v x" + obj.count + (mat.alphaTest ? " cut" : "") + (obj.userData.far ? " far" : "") : obj.isSkinnedMesh ? "skinned" : "mesh") + ":" + (geo.type || "") + ":" + (mat.type || "")) ;
    tally.set(k, (tally.get(k) || 0) + 1);
    const nT = Math.min(geo.drawRange.count, geo.index ? geo.index.count : geo.attributes.position ? geo.attributes.position.count : 0) / 3 * (obj.isInstancedMesh ? obj.count : geo.isInstancedBufferGeometry ? geo.instanceCount : 1);
    tris.set(k, (tris.get(k) || 0) + (isFinite(nT) ? nT : 0)); return oRBD(cam, sc, geo, mat, obj, grp);
  };
  E.frame(1 / 60, false);
  renderer.render = oRender; renderer.renderBufferDirect = oRBD;
  const lights = []; G.world && E.G && (await import('./js/engine.js')).G.scene.traverse(o => { if (o.isLight && o.castShadow) lights.push([o.type, o.name, o.shadow.mapSize.x, o.shadow.camera.uuid.slice(0,4), o.shadow.autoUpdate, o.visible]); });
  window.__tally = { tris: [...tris].sort((a, b) => b[1] - a[1]).slice(0, 14).map(([k, v]) => [k, Math.round(v)]), lights, passes: Object.fromEntries(passes), top: [...tally].sort((a, b) => b[1] - a[1]).slice(0, 40) };
  renderer.info.autoReset = false; renderer.info.reset(); E.frame(1 / 60, false); const info = { calls: renderer.info.render.calls, triangles: renderer.info.render.triangles }; renderer.info.autoReset = true;
  const w = G.world;
  restore();
  window.__rb = { kept: Object.keys(keep).length, chapter: O.chapter, mode: G.mode, sim, full, calls: info.calls, tris: info.triangles, geos: renderer.info.memory.geometries, tex: renderer.info.memory.textures, progs: renderer.info.programs.length, actors: w && w.actors.length, q: G.settings.quality, size: [renderer.domElement.width, renderer.domElement.height], errs: errs.slice(0, 3) };
  return JSON.stringify(window.__rb) + '\nTALLY ' + JSON.stringify(window.__tally);
})().then(r => window.__tres = r).catch(e => window.__tres = JSON.stringify({ err: String(e.stack || e) }))