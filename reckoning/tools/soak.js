// A TEST, not part of the game: a long playtest at speed, watching for what should never happen.
// Run it before a release, in the real app against a COPY of a save (never the real one):
//   RECKONING_USERDATA=<copy> RECKONING_SELFTEST=<out.jpg> RECKONING_EVAL=tools/soak.js RECKONING_EVAL_SECS=600 npx electron . --mute
// or on a busy test town from the dev server (tools/probe.js, with globalThis.SOAK = { mode: "test" } set first).
// Settings, all optional, on globalThis.SOAK: { mode: "save" | "test", days: 10, secs: 420 (real seconds at most) }.
// It reports problems (things that must not happen) and warnings (things worth a look), and the frame rate.
(async () => {
  const O = Object.assign({ mode: "save", days: 10, secs: 420 }, globalThis.SOAK || {});
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const problems = new Map(), warnings = new Map();
  const bad = (k, msg) => { if (!problems.has(k)) problems.set(k, msg); };
  const warn = (k, msg) => { if (!warnings.has(k)) warnings.set(k, msg); };
  addEventListener("error", e => bad("err:" + e.message, `Error: ${e.message} @ ${(e.filename || "").split("/").pop()}:${e.lineno}`));
  addEventListener("unhandledrejection", e => { if (e.reason !== "stop") bad("rej:" + String(e.reason).slice(0, 80), `Unhandled: ${String(e.reason && e.reason.stack || e.reason).slice(0, 300)}`); });
  const oe = console.error; console.error = (...a) => { bad("con:" + String(a[0]).slice(0, 80), `console.error: ${a.map(String).join(" ").slice(0, 300)}`); oe(...a); };

  const E = await import("./js/engine.js"), G = E.G;
  const { UI } = await import("./js/ui.js");
  if (O.mode === "save") {
    const b = document.getElementById("btnContinue"); if (b) b.click();
    for (let i = 0; i < 60 && !(G.town && G.town.S); i++) await sleep(500);
    await sleep(3000);
  } else {
    // a busy test town: a dozen people at every trade, the works built, and a second settlement
    for (let n = 1; n <= 6; n++) localStorage.removeItem(n === 1 ? "reckoning.save.v1" : "reckoning.save.v1.s" + n);
    const W = await import("./js/woods.js"), Col = await import("./js/colony.js");
    window.__manual = true; window.__play(14, "brother");
    for (let i = 0; i < 25; i++) { for (let k = 0; k < 10; k++) { E.frame(1 / 30, true); if (UI.dialogOpen && UI._advance) UI._advance(); } await sleep(15); }
    const t = G.town, S = t.S, C = W.CLEARING;
    Object.assign(S, { coin: 300, rye: 600, store: 40, stone: 40, planks: 30, bricks: 30, iron: 10, ore: 10, bread: 30 });
    const jobs = ["farmer", "hauler", "woodcutter", "baker", "hunter", "quarryman", "sawyer", "smith", "watch", "miner", "doctor", "hauler"], fams = ["Brandt", "Kessler", "Vogt", "Meier"];
    jobs.forEach((j, i) => t.addPerson({ name: "Soak" + i, sex: i % 2 ? "f" : "m", seed: 200 + i, job: j, family: fams[i % 4], purse: 15 }, C.x - 6 + (i % 4) * 3, C.z + 8 + Math.floor(i / 4) * 2));
    for (const [type, dx, dz] of [["cabin", 12, 6], ["cabin", -12, 6], ["cabin", 12, -8], ["woodshed", -10, -8], ["field", 0, 16], ["bakery", 16, 0], ["jail", -16, 0], ["townhall", 0, -16], ["market", -18, 14], ["newsstand", 6, -5]]) {
      const b = { type, x: C.x + dx, z: C.z + dz, ry: 0, logs: 99, done: true, door: true, dug: 3, sown: true, growth: 2, tier: 1 }; S.buildings.push(b); t.show(b);
    }
    const c = { name: "Soakhof", x: C.x + 60, z: C.z + 40, r: 20, road: [[C.x + 25, C.z], [C.x + 60, C.z + 40]], day: t.day, store: 8, rye: 40, seed: 1 };
    (S.colonies ??= []).push(c); Col.lay(t, c); t.addPerson({ name: "SoakCol", sex: "m", seed: 300, job: "farmer", home: "Soakhof" }, c.x, c.z);
  }
  const t = G.town; if (!t || !t.S) return JSON.stringify({ problems: ["No settlement loaded — nothing to test."] });
  const S = t.S, w = G.world;
  if (w && w.rain) w.rain = 0;
  G.lockMove = true;   // (you stand still; the town goes on)

  // ---- the frame rate, drawn for real ----
  const perf = async label => {
    const r = (await import("./js/core.js")).renderer, ts = [];
    r.info.autoReset = false;
    let calls = 0, tris = 0;
    for (let i = 0; i < 20; i++) { E.frame(1 / 60, false); await sleep(1); }
    for (let i = 0; i < 120; i++) {
      r.info.reset();
      const a = performance.now(); E.frame(1 / 60, false); if (i % 10 === 0) r.getContext().finish(); ts.push(performance.now() - a);
      calls += r.info.render.calls; tris += r.info.render.triangles; await sleep(0);
    }
    r.info.autoReset = true;
    // and the frames the browser actually shows in a few seconds of the game running on its own
    let n = 0; const t1 = performance.now(); await new Promise(res => { const f = () => { n++; performance.now() - t1 < 3000 ? requestAnimationFrame(f) : res(); }; requestAnimationFrame(f); });
    ts.sort((a, b) => a - b);
    const avg = ts.reduce((a, b) => a + b, 0) / ts.length;
    return { label, fps: Math.round(n / ((performance.now() - t1) / 1000)), avgMs: +avg.toFixed(1), p95Ms: +ts[Math.floor(ts.length * 0.95)].toFixed(1), drawCalls: Math.round(calls / 120), triangles: Math.round(tris / 120), geometries: r.info.memory.geometries, textures: r.info.memory.textures,
      people: S.people.length, actors: t.actors.length, buildings: S.buildings.length, heapMB: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1e6) : null };
  };
  const perfStart = await perf("start");

  // ---- what to watch ----
  const STORES = ["store", "rye", "bread", "meat", "stone", "planks", "bricks", "iron", "ore", "seed"];
  const places = () => [null, ...(S.colonies || [])];
  const gone = [];   // buildings pulled down by the test: they must stay down
  t.on("dismantled", b => gone.push({ type: b.type, x: b.x, z: b.z, b }));
  t.on("reaped", () => { if (t.winter) bad("winterReap", `A field was reaped in winter (day ${t.day + 1}).`); });
  const last = new Map(), still = new Map(), stone0 = {};
  const check = () => {
    // the numbers: never NaN, never below nothing, never past the stores' room
    for (const c of places()) {
      const v = t.viewFor(c), where = c ? c.name : (S.name || "the first settlement");
      for (const k of STORES) { const n = v.S[k] ?? 0; if (!Number.isFinite(n)) bad(`nan:${where}:${k}`, `${where}: ${k} is ${n}.`); else if (n < -0.01) bad(`neg:${where}:${k}`, `${where}: ${k} went below nothing (${n}).`); }
      if ((v.S.store || 0) > v.storeCap + 1) bad(`cap:${where}:logs`, `${where}: ${v.S.store} logs, over the room for ${v.storeCap}.`);
      // (stone kept from before there was a limit is let be; only more of it, past the limit, is wrong)
      const s0 = (stone0[where] ??= v.S.stone || 0);
      if ((v.S.stone || 0) > v.stoneCap + 2 && (v.S.stone || 0) > s0 + 0.5) warn(`cap:${where}:stone`, `${where}: ${v.S.stone} stone, over the limit of ${v.stoneCap}.`);
    }
    if (!Number.isFinite(S.coin)) bad("coin", `The treasury is ${S.coin}.`);
    // what was pulled down stays down
    for (const g of gone) {
      if (S.buildings.includes(g.b) || S.buildings.some(b => b.type === g.type && Math.abs(b.x - g.x) < 0.01 && Math.abs(b.z - g.z) < 0.01)) bad(`back:${g.type}`, `A ${g.type} that was pulled down came back.`);
      if (t.vis.get(g.b)) bad(`backvis:${g.type}`, `A pulled-down ${g.type} is still drawn.`);
    }
    // everything standing is drawn, and nothing is drawn that isn't standing
    for (const b of S.buildings) if (!t.vis.get(b) && !(b.type === "path" && !b.done)) bad(`novis:${b.type}`, `A ${b.type} at ${b.x.toFixed(0)},${b.z.toFixed(0)} isn't drawn.`);
    for (const [b, g] of t.vis) if (!S.buildings.includes(b) && g.parent) bad(`orphan:${b.type}`, `A ${b.type} is drawn that isn't in the settlement any more.`);
    // the people: each once, each somewhere real, at home in a settlement that exists
    const names = new Set(), cols = new Set((S.colonies || []).map(c => c.name));
    for (const p of S.people) {
      if (names.has(p.name)) warn(`dup:${p.name}`, `Two people called ${p.name}.`); names.add(p.name);
      if (p.home && !cols.has(p.home)) bad(`home:${p.name}`, `${p.name}'s home, ${p.home}, doesn't exist.`);
      const a = t.actors.find(x => x.settler === p);
      if (!a) { if (p.jailedDay == null && !p.away) warn(`noactor:${p.name}`, `${p.name} has no body in the world.`); continue; }
      const { x, z, y } = a.pos;
      if (![x, y, z].every(Number.isFinite)) { bad(`nanpos:${p.name}`, `${p.name}'s position is NaN.`); continue; }
      if (w && w.heightAt && y < w.heightAt(x, z) - 1.5 && !a.lying) bad(`under:${p.name}`, `${p.name} is under the ground at ${x.toFixed(0)},${z.toFixed(0)}.`);
      // stuck: in the same spot through the working day, doing nothing in particular
      const f = (t.t % t.dayLen) / t.dayLen, l = last.get(p);
      if (f > 0.15 && f < 0.6 && l && Math.hypot(x - l.x, z - l.z) < 0.25 && !p.sick && p.jailedDay == null && !p.child && !/^at the |waiting|idle|shop|sell|serv|keep|guard|watch|pray|cook|bake|sleep/i.test(a.doing || "")) {
        const n = (still.get(p) || 0) + 1; still.set(p, n);
        if (n >= 8) warn(`stuck:${p.name}`, `${p.name} hasn't moved for a good part of the day at ${x.toFixed(0)},${z.toFixed(0)} (${a.doing || "doing nothing"}).`);
      } else still.set(p, 0);
      last.set(p, { x, z });
    }
    for (const a of t.actors) if (a.settler && !a.dead && !a.gone && !S.people.includes(a.settler)) warn(`ghost:${a.settler.name}`, `${a.settler.name} walks about but isn't in the settlement.`);
  };

  // ---- the run ----
  const day0 = t.day, t0 = performance.now(), hour = t.dayLen / 24;
  let nextCheck = t.t + hour, pulled = false, staked = null, news0 = (S.news || []).length;
  while (t.day < day0 + O.days && performance.now() - t0 < O.secs * 1000) {
    for (let i = 0; i < 10; i++) E.frame(1 / 15, true);
    if (UI.dialogOpen && UI._advance) UI._advance();
    if (G.health != null && G.health < 0.5) { G.health = 1; G.downed = false; }
    // a building site staked out, and pulled down again before it's raised: it must stay down
    if (!staked && t.t > (day0 + 0.1) * t.dayLen) {
      const C = (await import("./js/woods.js")).CLEARING;
      staked = { type: "cabin", x: C.x + 22, z: C.z - 20, ry: 0, logs: 0 }; S.buildings.push(staked); t.show(staked);
    }
    if (staked && !pulled && t.t > (day0 + 0.35) * t.dayLen) { pulled = true; if (S.buildings.includes(staked)) t.dismantle(staked); }
    if (t.t >= nextCheck) { nextCheck = t.t + hour; check(); }
    await sleep(6);
  }
  check();
  const perfEnd = await perf("end");
  const newsN = (S.news || []).length - news0;
  if (O.days >= 2 && newsN < 3) warn("news", `Only ${newsN} things went into the news in ${t.day - day0} days.`);
  const out = { mode: O.mode, days: t.day - day0, realSecs: Math.round((performance.now() - t0) / 1000), people: S.people.length, news: newsN,
    problems: [...problems.values()], warnings: [...warnings.values()], perf: [perfStart, perfEnd] };
  return JSON.stringify(out, null, 1);
})()
