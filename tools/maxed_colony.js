// Builds a fully-grown colony in a running game, for looking at things that
// take an hour of honest play to reach — the far map especially, which needs the
// whole Exploration tree before the camera will rise high enough to see Europe.
//
// Start a NEW GAME, name the empire, then in the browser console:
//
//     fetch('/tools/maxed_colony.js').then(r => r.text()).then(eval)
//
// It researches everything, raises a walled town of twenty-six souls with two
// daughter settlements, charts the continent, and sets Europe going: two crowns
// at war with you, two trading, three wars of their own, an agent established in
// Copenhagen and a Brandenburg column already two-thirds of the way to your gate.
// Then it saves, so it is there in the slot next time.
//
// This is a development tool. Nothing in the shipped game loads it.
(() => {
  if (typeof gameState === "undefined" || gameState !== "playing") {
    alert("Start a new game first (and name the empire), then run this again.");
    return;
  }

  // --- everything known, a full treasury, and room to build in ---
  for (const t of Object.values(TECH)) t.done = true;
  research = null;
  Object.assign(res, { logs: 900, seeds: 300, stone: 800, ironore: 300, copperore: 200, tin: 150,
                       copper: 120, iron: 300, bronze: 120, doors: 80, wheat: 400, bread: 320,
                       meat: 260, dm: 5000, weapons: 40, tools: 40 });
  res.armoury = { stone: 6, bronze: 12, iron: 22 };
  reconcileArmoury();
  expandAround(0, 0, 16);
  settlementName = "Falkenwald";
  colonyYear = 1697; playT = 5400; nextSettleAt = 6600;
  tutStep = 99; tutSeen.map = true; tutSeen.gov = true; tutSeen.tech = true;
  lessonsOff = true;
  // the vignettes have all had their moment; none of them should fire on load
  vigSeen = { firstWinter: 1, cabinDone: 1, firstRecruit: 1, firstChild: 1,
              firstSettlement: 1, village: 1, firstWar: 1 };
  chartAround(EMPIRE_HOME.mx, EMPIRE_HOME.my, atlasR());

  // --- the town: staked out through the game's own builder, then finished ---
  function put(type, x, y, rot) {
    for (const t of nearThings("trees", x, y, 130)) { t.alive = false; markChunkDirty(t.x, t.y); }
    for (const s of nearThings("stones", x, y, 120)) { s.alive = false; markChunkDirty(s.x, s.y); }
    wallRot = rot || 0; buildMode = type;
    tryPlace(type, x, y);
  }
  const plan = [
    ["townhall", 0, 140], ["market", -300, 20], ["forge", 300, 20], ["bakery", -120, 300],
    ["well", 120, 300], ["smelter", 440, 120], ["mine", 580, 260], ["quarry", -580, 260],
    ["sawmill", -440, 120], ["hospital", -300, 460], ["jail", 300, 460], ["temple", 0, -220],
    ["recruit", 180, -220], ["watchtower", -520, -300], ["watchtower", 520, -300],
  ];
  for (const [t, x, y] of plan) put(t, x, y);
  for (let i = 0; i < 14; i++) put("cabin", -650 + (i % 7) * 200, i < 7 ? -420 : 620);
  for (let i = 0; i < 6; i++) put("farm", -450 + (i % 3) * 320, i < 3 ? 800 : 950);
  // a stone curtain round the lot, with a gate on each road
  const L = -820, R = 820, T = -620, B = 1120, STEP = 44;
  for (let x = L; x <= R; x += STEP) {
    const g = Math.abs(x) < STEP;
    put(g ? "stonegate" : "stonewall", x, T, 0);
    put(g ? "stonegate" : "stonewall", x, B, 0);
  }
  for (let y = T + STEP; y < B; y += STEP) {
    const g = Math.abs(y - 260) < STEP / 2;
    put(g ? "stonegate" : "stonewall", L, y, 1);
    put(g ? "stonegate" : "stonewall", R, y, 1);
  }
  for (const b of buildings) {
    b.site = false; b.buildP = 1; b.progress = -1; b.builder = null;
    b.shop = b.shop || [];
    if (b.hp === undefined) b.hp = b.maxHp = 100;
  }
  for (const f of farms) { f.site = false; f.buildP = 1; f.ready = true; f.growT = 0; f.workers = []; }
  buildMode = null; wallRot = 0;

  // --- the people ---
  const MEN = ["Anselm", "Bertram", "Cord", "Detlev", "Eberhard", "Frobin", "Gerlach", "Hartmut",
               "Ingo", "Jost", "Kuno", "Lambert", "Meinhard", "Norbert", "Otmar", "Reinhold",
               "Siegward", "Thilo", "Volkmar", "Wendel"];
  const WOMEN = ["Adelheid", "Brigitta", "Cordula", "Dorothea", "Elsbeth", "Friederike", "Gertrud",
                 "Hedwig", "Irmgard", "Katharina", "Liselotte", "Mechthild", "Nesta", "Ottilie",
                 "Reinhild", "Sieglinde"];
  const ROLES = ["lumberjack", "lumberjack", "forager", "farmer", "farmer", "quarryman", "miner",
                 "blacksmith", "blacksmith", "doctor", "police", "police", "soldier", "soldier",
                 "soldier", "soldier", "musketeer", "musketeer", "musketeer", "cavalry", "cavalry",
                 "hunter", "forager", "farmer"];
  let mi = 0, fi = 0;
  for (const prof of ROLES) {
    const female = ["doctor", "forager", "farmer"].includes(prof) && Math.random() < 0.5;
    const name = female ? WOMEN[fi++ % WOMEN.length] : MEN[mi++ % MEN.length];
    const a = Math.random() * Math.PI * 2, r = 120 + Math.random() * 380;
    const c = mkCiv(name, female ? "sister" : "brother",
                    Math.cos(a) * r, 200 + Math.sin(a) * r * 0.7, female ? "f" : "m");
    c.profession = prof;
    c.happiness = 72 + Math.floor(Math.random() * 22);
    c.hunger = 82 + Math.floor(Math.random() * 18);
    c.armed = ["police", "soldier", "musketeer", "cavalry"].includes(prof);
    if (c.armed) c.tool = "iron";
    refreshAvatar(c);
    civs.push(c);
  }
  for (const c of civs) if (!c.home) houseCiv(c);

  // --- two daughter towns, with their flags where the towns actually stand ---
  function found(name, x, y, souls) {
    for (let i = 0; i < 3; i++) {
      const bx = x + i * 170 - 170;
      for (const t of nearThings("trees", bx, y, 140)) { t.alive = false; markChunkDirty(t.x, t.y); }
      for (const s of nearThings("stones", bx, y, 120)) { s.alive = false; markChunkDirty(s.x, s.y); }
      buildings.push({ type: "cabin", x: bx, y, progress: -1, occupants: [], fire: 0,
                       torchP: -1, placed: true, bakeT: 0, site: false, buildP: 1, shop: [] });
    }
    expandAround(x, y, 6);
    settlements.push({ name, pop: souls, x, y,
      res: { logs: 40, seeds: 20, stone: 30, iron: 8, wheat: 30, bread: 24, meat: 18,
             dm: 120, doors: 4, weapons: 3 },
      ...worldCell(x, y) });
  }
  found("Tannenfeld", -2100, -1500, 6);
  found("Ostbruck", 2400, 900, 5);
  civs.filter(c => !isForce(c)).slice(0, 6).forEach((c, i) => {
    const st = settlements[i % 2];
    const cab = buildings.filter(b => b.type === "cabin" &&
                                      Math.hypot(b.x - st.x, b.y - st.y) < 500)[i % 3];
    if (!cab) return;
    if (c.home) c.home.occupants = c.home.occupants.filter(o => o !== c);
    c.home = cab; cab.occupants.push(c);
    c.x = cab.x - 40 + (i % 2) * 80; c.y = cab.y + 40;
  });

  // --- and a Europe with something going on in it ---
  NATIONS.denmark.atWar = true; NATIONS.denmark.warT = 260;
  NATIONS.brandenburg.atWar = true; NATIONS.brandenburg.warT = 340;
  NATIONS.sweden.trade = true; NATIONS.sweden.tradeT = 45;
  NATIONS.poland.trade = true; NATIONS.poland.tradeT = 55;
  NATIONS.france.calT = 300; NATIONS.france.calName = "Plague";
  natWars = [{ a: "ottoman", b: "austria", t: 40, battles: 1 },
             { a: "france", b: "castile", t: 65, battles: 0 },
             { a: "sweden", b: "russia", t: 95, battles: 2 }];
  marches = [];
  for (const k of Object.keys(intel)) delete intel[k];
  // an agent already established, so the spy panel has something in it
  const cph = CITIES.find(c => c.name === "Copenhagen"), p = cellWorld(cph.mx, cph.my);
  const spy = mkMarch({ kind: "spy", side: "you", nation: cph.owner, target: cph.id,
                        x: p.x, y: p.y, tx: p.x, ty: p.y, str: 1, name: "your agent",
                        state: "resident", t: 25 });
  intel[cph.owner] = { armies: true, arts: true, by: spy.id, city: cph.id };
  // a scout a third of the way east, and a column already well down the road
  const sc = sendScout(cellWorld(52, 14).x, cellWorld(52, 14).y, "Poland");
  sc.x = sc.sx + (sc.tx - sc.sx) * 0.35; sc.y = sc.sy + (sc.ty - sc.sy) * 0.35;
  const foe = dispatchWarColumn("brandenburg", null, false);
  foe.x = foe.sx + (foe.tx - foe.sx) * 0.62; foe.y = foe.sy + (foe.ty - foe.sy) * 0.62;
  foe.seen = true;
  notifs = []; renderNotifs();

  zoom = 0.55; cam.x = -canvas.width / 2 / zoom; cam.y = 200 - canvas.height / 2 / zoom;
  syncUI(); saveGame();
  console.log(`Falkenwald: ${civs.length} souls, ${buildings.length} buildings, ` +
              `${charted.size} leagues charted. Saved to slot ${saveSlot}.`);
})();
