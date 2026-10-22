// ===========================================================================
//  FORESTER: RECKONING — Copyright (c) 2026 Roan Fraese / DeadlyDog Productions
// ===========================================================================

// COLD AND HEAT. How warm the air is where you stand — by the latitude and the country (on the Earth), the season
// (in the story), the hour, how high you are, and whether you're wet — and how warm you are in it: a coat, fur, a
// hat, or shirtsleeves and a broad brim. Out of doors in the cold, the cold gets into you, and the gauge (a
// snowflake) fills; in the heat, the sun does, and it fills under a sun. Full, it starts to take your health. A
// fire warms you and dries you, a cave keeps the same cool air winter and summer, and a roof over you keeps off the
// wind and the sun.

import { THREE, FLAMES, SNOW } from "./core.js";

// what each outfit keeps out: warmth (°, in the cold) and how much hotter it makes the heat
const CLOTHES = {
  raider: [10, 9],       // fur and leather
  magistrate: [7, 6],    // the long coat
  townsman: [6, 5], watchman: [6, 5], musketeer: [6, 5], janissary: [7, 5], strelets: [8, 6], haiduk: [7, 5], warrior: [3, 2], warrior_braids: [3, 2], brother: [6, 4], watchwoman: [5, 4],
  jakob: [4, 3],         // a short coat
  townswoman: [3, 1], albers: [3, 1],
  father: [2, 0],        // shirtsleeves and a waistcoat
  sister: [2, 0],        // a working dress, sleeves rolled
};
// a hat: a fur one warms; a brim shades you from the sun
const HATS = { raider: [2, 2], none: [0, 0], jakob: [1, 0], albers: [1, 0], townswoman: [1, -1] };
const HAT_DEFAULT = [1, -2];
export const COMFORT = { cold: 6, hot: 30 };

const v = new THREE.Vector3();
let fireT = 0, fireHeat = 0, near = null;

// the heat of the fires round you (looked for a few times a second): each fire's own warmth, falling off over a few metres
function fires(G, dt) {
  if ((fireT -= dt) > 0) return fireHeat;
  fireT = 0.25; fireHeat = 0; near = null;
  const p = G.player.pos, scene = G.scene;
  for (const f of FLAMES) {
    if (!f.parent || !f.visible) continue;
    let o = f, up = 0; while (o.parent && up++ < 12) o = o.parent; if (o !== scene) continue;
    f.getWorldPosition(v);
    const size = f.userData.heat || 1, reach = 3 + size * 4, d = Math.hypot(v.x - p.x, v.z - p.z);
    if (d > reach || Math.abs(v.y - p.y) > 4) continue;
    const h = Math.pow(1 - d / reach, 1.2) * 24 * Math.min(1.2, size);
    if (h > fireHeat) { fireHeat = h; near = { x: v.x, z: v.z }; }
  }
  return fireHeat;
}

// the air, where you are (°C, near enough)
const MONTH_SEASON = { jan: "winter", feb: "winter", mar: "spring", apr: "spring", may: "spring", jun: "summer", jul: "summer", aug: "summer", sep: "autumn", oct: "autumn", nov: "autumn", dec: "winter" };
function battleSeason(G) {
  const t = G.arena && G.arena.place && G.arena.place.text; if (!t) return null;
  const w = /\b(spring|summer|autumn|winter)\b/i.exec(t); if (w) return w[1].toLowerCase();
  const m = /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b/i.exec(t); return m ? MONTH_SEASON[m[1].toLowerCase()] : null;
}
export function airTemp(G) {
  const w = G.world, p = G.player.pos;
  let t, dry = 0;
  // (a battle with a date: its season, whatever the field's own country would say)
  const bs = !G.town && battleSeason(G);
  if (bs) t = { spring: 11, summer: 19, autumn: 9, winter: -6 }[bs];
  else if (w && w.land && w.land.climate) {
    const c = w.land.climate(p.x, p.z); t = -18 + 52 * Math.pow(Math.max(0, c.t), 0.85);
    // (a desert bakes by day and freezes by night; the rain forest is close, but never so hot)
    dry = Math.max(0, 0.35 - c.m) / 0.35; if (c.m > 0.7) t -= 4;
  }
  else {
    const season = G.town && G.town.season;
    t = { spring: 11, summer: 19, autumn: 9, winter: -6 }[season] ?? 12;
    t -= Math.max(0, p.y - 30) * 0.05;
  }
  // the hour: the sun up warms it, the night takes it down
  const sy = G.sunDir ? G.sunDir.y : 0.5;
  t += sy > 0 ? (Math.min(1, sy * 2.5) * (4 + dry * 9) - 1) : (-1 - Math.min(1, -sy * 4) * (6 + dry * 12));
  // snow on the ground: the cold of it
  if (SNOW.value > 0.2) t = Math.min(t, 2 - SNOW.value * 6);
  return t;
}

// the outfit you have on
function wearing(G) {
  const L = (G.mp && G.mp.me && G.mp.me.look) || G.storyLook || null;
  const body = (L && L.body) || (G.who === "sister" ? "sister" : "brother");
  const hat = L ? (L.hat && L.hat !== "hat" ? L.hat : body) : body;
  const c = CLOTHES[body] || [4, 3], h = HATS[hat] || HAT_DEFAULT;
  return { warm: c[0] + h[0], heat: c[1] + h[1] };
}

// a moment of it: the felt temperature, and the gauge (-1 frozen through .. 0 comfortable .. 1 heatstruck)
export function tickTemperature(G, dt) {
  const B = G.body; if (!B || !G.player) return null;
  const pl = G.player, w = G.world;
  const inCave = !!(w && w.cave && w.cave.inside);
  const indoors = !inCave && !!(w && w.floorIn && w.floorIn(pl.pos.x, pl.pos.z, pl.pos.y) !== null);
  let air = airTemp(G);
  // in the water: colder than the air, and wet for a good while after
  if (pl.swimming) { G.wetT = 90; air -= 6; }
  else if (G.wetT > 0) G.wetT -= dt * (fireHeat > 4 ? 6 : 1);
  if (G.wetT > 0 && !pl.swimming) air -= 5 * Math.min(1, G.wetT / 60);
  // a cave: the same cool air, summer and winter; a roof: out of the wind, and out of the sun
  if (inCave) air = air + (12 - air) * 0.85;
  else if (indoors) air += air < 16 ? 6 : -4;
  // (a fire warms you to comfortable, and no further — standing at it in spring doesn't cook you)
  const fire = fires(G, dt);
  if (fire > 0) air = Math.max(air, Math.min(air + fire, 24));
  const wear = wearing(G);
  const felt = air < 18 ? Math.min(18, air + wear.warm) : air + wear.heat * Math.min(1, (air - 18) / 10);
  // the gauge: filling while it's too cold or too hot, and emptying while it's right (quicker by a fire)
  let g = B.temp || 0;
  if (felt < COMFORT.cold) g -= dt * (COMFORT.cold - felt) / 2400;
  else if (felt > COMFORT.hot) g += dt * (felt - COMFORT.hot) / 1100;
  else g += (0 - g) * Math.min(1, dt / (fire > 4 ? 12 : 40));
  // (by a fire, the cold goes out of you even when the air round it is still cold)
  if (fire > 4 && g < 0) g = Math.min(0, g + dt / 25);
  if (inCave && g > 0) g = Math.max(0, g - dt / 30);
  // (a battle's season shows on the gauge, but a battle is over before the weather could tell on you: it stays empty)
  if (G.arena) g = 0;
  B.temp = Math.max(-1, Math.min(1, g)); B.dirty = true;
  return { air, felt, g: B.temp, fire: fire > 4, inCave, indoors, wear };
}
