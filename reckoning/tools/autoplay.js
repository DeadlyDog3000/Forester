// A TEST, not part of the game: plays one story chapter from a fresh start as a new player would, as far
// as it can — following the marker, using whatever is in reach, swinging at trees when there's felling to do,
// and clicking through the talk. It stops when the next chapter starts, or when nothing has moved on for a
// while, and reports the objectives it saw, where it got stuck, and any errors.
// Run it with tools/probe.js against the dev server, with globalThis.AUTO = { chapter: 1, secs: 240 } set first:
//   npx electron tools/probe.js <script> 300 "http://127.0.0.1:8182/reckoning/?mute"
// (it wipes the probe's saves: never point it at a real one)
(async () => {
  const O = Object.assign({ chapter: 1, secs: 240, who: "brother", stuck: 150 }, globalThis.AUTO || {});
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const errors = [];
  addEventListener("error", e => errors.push(`${e.message} @ ${(e.filename || "").split("/").pop()}:${e.lineno}`));
  addEventListener("unhandledrejection", e => { const m = String(e.reason && e.reason.stack || e.reason); if (e.reason !== "stop" && !/^Error: abort/.test(m)) errors.push(m.slice(0, 300)); });
  const oe = console.error; console.error = (...a) => { errors.push("console.error: " + a.map(String).join(" ").slice(0, 300)); oe(...a); };
  const E = await import("./js/engine.js"), G = E.G, input = E.input;
  const { UI } = await import("./js/ui.js");
  for (let n = 1; n <= 6; n++) localStorage.removeItem(n === 1 ? "reckoning.save.v1" : "reckoning.save.v1.s" + n);
  window.__manual = true;
  window.__play(O.chapter, O.who);
  const obj = () => ((document.getElementById("objText") || {}).textContent || "").trim();
  const seen = [], log = [];
  const hist = []; let shotT = 0; let bestKey = "", bestD = Infinity, bestT = 0; let tries = 0, atMark = 0, lastDir = null, last = "", lastT = 0, simT = 0, lastUse = new Map(), t0 = performance.now(), lastChange = performance.now(), stuck = null;
  const labelOf = it => { try { return typeof it.label === "function" ? it.label() : it.label; } catch (e) { return "?"; } };
  const markerAt = () => {
    const m = G.marker; if (!m) return null;
    if (m.actor) return { x: m.actor.pos.x, z: m.actor.pos.z };
    if (m.x != null) return { x: m.x, z: m.z };
    return null;
  };
  // a step toward somewhere, at a brisk walk (through walls, if it must: this is a test, not a player)
  const stepTo = (x, z, dt, near = 1.6) => {
    const p = G.player.pos, dx = x - p.x, dz = z - p.z, d = Math.hypot(dx, dz);
    if (d < near) return true;
    const s = Math.min(d - near * 0.8, 6 * dt);
    G.player.place(p.x + dx / d * s, p.z + dz / d * s, Math.atan2(-dx, -dz));
    return false;
  };
  while (performance.now() - t0 < O.secs * 1000) {
    const dt = 1 / 30;
    for (let i = 0; i < 6; i++) { E.frame(dt, true); simT += dt; }
    input.click = false;
    if (G.chapter !== O.chapter) break;
    // talk, guides, questions: on through them (the first answer, always)
    if (UI.dialogOpen && UI._advance) UI._advance();
    for (const id of ["guideOk", "lessonOk"]) { const e = document.getElementById(id); if (e && e.offsetParent) e.click(); }
    const ask = document.querySelector("#askChoices button[data-i]"); if (ask && ask.offsetParent) ask.click();
    if (G.health != null && G.health < 0.4) { G.health = 1; G.downed = false; }
    // (told to hide: down, as a player told to would)
    if (G.player) G.player.crouched = /\bhid(e|den)\b|crouch|unseen/i.test(last);
    const o = obj();
    if (o !== last) { seen.push([Math.round(simT), o]); last = o; lastT = simT; lastChange = performance.now(); }
    const w = G.world, pl = G.player;
    if (w && pl && !G.lockMove && !G.cine && !UI.dialogOpen) {
      const m = markerAt();
      // the marker flipping back and forth (a straight line through a wall, where a player would go round): straight there
      const key = m ? `${G.marker.actor ? "a" : ""}${Math.round(m.x)},${Math.round(m.z)}` : "";
      if (key !== hist[hist.length - 1]) { hist.push(key); if (hist.length > 6) hist.shift(); }
      const h = hist.length;
      if (m && h >= 4 && hist[h - 1] === hist[h - 3] && hist[h - 2] === hist[h - 4] && hist[h - 1] !== hist[h - 2]) {
        G.player.place(m.x + 1.2, m.z + 1.2); hist.length = 0; log.push(`${Math.round(simT)}s jumped to the marker`);
      }
      // no nearer the marker for a while (a building in the way): straight there
      if (m) {
        const d = Math.hypot(m.x - pl.pos.x, m.z - pl.pos.z);
        if (key !== bestKey || d < bestD - 0.5) { bestKey = key; bestD = d; bestT = simT; }
        else if (d > 2 && simT - bestT > 4) { G.player.place(m.x + 0.9, m.z + 0.9); bestT = simT; log.push(`${Math.round(simT)}s blocked: jumped to the marker`); }
      }
      // what's in reach, the nearest the marker first
      // (never closing a door: a player walks through an open one)
      const its = (w.interact || []).filter(it => it.x != null && Math.hypot(it.x - pl.pos.x, it.z - pl.pos.z) < (it.reach || 2) + 0.4 && (!it.can || it.can()) && labelOf(it) && !/^Close the/.test(labelOf(it))
        // (a fire fed only when it's burning low, as the player is told)
        && !(/^Feed the fire/.test(labelOf(it)) && +((last.match(/fire (\d+)%/) || [])[1] ?? 0) > 60));
      if (m) its.sort((a, b) => Math.hypot(a.x - m.x, a.z - m.z) - Math.hypot(b.x - m.x, b.z - m.z));
      const it = its.find(it => !lastUse.has(it) || simT - lastUse.get(it) > 2.5);
      if (it && (!m || Math.hypot(it.x - m.x, it.z - m.z) < 4 || simT - lastT > 20)) {
        lastUse.set(it, simT); log.push(`${Math.round(simT)}s use: ${labelOf(it)}`);
        try { it.use(); } catch (e) { errors.push("use threw: " + e.message); }
        if (G.closeTrade && document.querySelector("#trade:not(.hidden)")) setTimeout(() => G.closeTrade(), 300);
      } else if (m) {
        // (at the marker and it hasn't moved on: a doorway, a gate — on through it the way we were going)
        if (stepTo(m.x, m.z, dt * 6, 0.3)) {
          // (the way we came first, then each other way in turn)
          if ((atMark = (atMark || 0) + dt * 6) > 1.5) {
            const k = (tries = (tries || 0) + 1), a = (lastDir ? Math.atan2(lastDir.x, lastDir.z) : 0) + [0, Math.PI / 2, -Math.PI / 2, Math.PI][k % 4];
            G.player.place(m.x + Math.sin(a) * 2.2, m.z + Math.cos(a) * 2.2); atMark = 0;
          }
        } else { atMark = 0; const d = Math.hypot(m.x - pl.pos.x, m.z - pl.pos.z) || 1; if (d > 3) lastDir = { x: (m.x - pl.pos.x) / d, z: (m.z - pl.pos.z) / d }; }
      }
      else if (w.road && w.road.length && /road/i.test(last)) {
        // a road to follow, and no marker: on along it, from wherever on it we are
        let k = 0, bd = Infinity; w.road.forEach((r, i) => { const d = Math.hypot(r.x - pl.pos.x, r.z - pl.pos.z); if (d < bd) { bd = d; k = i; } });
        const nx = w.road[Math.min(w.road.length - 1, k + 4)]; stepTo(nx.x, nx.z, dt * 6, 0.3);
      }
      else if (/hunt/i.test(last) && G.hunt && G.hunt.animals.some(a => a.alive && a.hit)) {
        // a hunt, and no marker: up to the nearest beast, and a good arrow into it (a stand-in for the bow)
        const a = G.hunt.animals.filter(a => a.alive && a.hit && !a.raid).sort((p, q) => Math.hypot(p.pos.x - pl.pos.x, p.pos.z - pl.pos.z) - Math.hypot(q.pos.x - pl.pos.x, q.pos.z - pl.pos.z))[0];
        if (a && stepTo(a.pos.x, a.pos.z, dt * 6, 12) && (shotT = (shotT || 0) - dt * 6) <= 0) { shotT = 1.5; try { a.hit(1, false); log.push(`${Math.round(simT)}s shot a ${a.kind || "beast"}`); } catch (e) { errors.push("hit threw: " + e.message); } }
      }
      else if (G.onSwing && w.fellable) {
        // felling to do, and no marker: the nearest standing tree
        const t = w.fellable.filter(t => t.state === "up").sort((a, b) => Math.hypot(a.x - pl.pos.x, a.z - pl.pos.z) - Math.hypot(b.x - pl.pos.x, b.z - pl.pos.z))[0];
        if (t && stepTo(t.x, t.z, dt * 6, 1.3)) { pl.yaw = Math.atan2(-(t.x - pl.pos.x), -(t.z - pl.pos.z)); input.click = true; }
      }
    }
    // nothing has moved on for a while: stuck
    if (simT - lastT > O.stuck && performance.now() - lastChange > 90000) {
      const m = markerAt();
      stuck = { objective: last, marker: m && { x: +m.x.toFixed(1), z: +m.z.toFixed(1) }, at: { x: +pl.pos.x.toFixed(1), z: +pl.pos.z.toFixed(1) },
        inReach: (w.interact || []).filter(it => it.x != null && Math.hypot(it.x - pl.pos.x, it.z - pl.pos.z) < 8).map(it => `${labelOf(it)}${it.can && !it.can() ? " (can't)" : ""}`).slice(0, 8),
        lockMove: !!G.lockMove, progress: w.progress ? +w.progress().toFixed(3) : null, cine: !!G.cine, dialog: !!UI.dialogOpen, onSwing: !!G.onSwing };
      break;
    }
    await sleep(2);
  }
  // a frame drawn, for the picture
  for (let i = 0; i < 3; i++) { E.frame(1 / 60, false); await sleep(16); }
  return JSON.stringify({ chapter: O.chapter, finished: G.chapter !== O.chapter, nowChapter: G.chapter, simSecs: Math.round(simT), realSecs: Math.round((performance.now() - t0) / 1000),
    objectives: seen, used: log.slice(-25), stuck, errors: [...new Set(errors)] }, null, 1);
})()
