// A bot that creeps up the lane in chapter IV to the small door by the marsh gate,
// with the other watchmen sent away, to test the gate watchman alone. Not part of the game.
//   const { gateRun } = await import("./tools/gatebot.js");
//   await gateRun({ crouch: true, delay: 4 })
import * as E from "../js/engine.js";
import { UI } from "../js/ui.js";

const G = E.G;
const ROUTE = [[-34.2, 58], [-34.2, 62.8], [-31.5, 65.4], [-27.5, 67]];
const step = async n => { for (let i = 0; i < n; i++) { E.frame(1 / 30, true); if (UI.dialogOpen && UI._advance) { UI._advance(); UI._advance(); } } await new Promise(r => setTimeout(r, 0)); };

export async function gateRun({ crouch = true, delay = 0, route = ROUTE } = {}) {
  window.__manual = true;
  window.__play(4, "brother", { retry: true });
  await step(30);
  // (the cart watchman and the one down the lane are sent off)
  for (const a of G.world.actors) if (Math.hypot(a.pos.x + 34.4, a.pos.z - 49) < 3 || Math.hypot(a.pos.x + 35.2, a.pos.z - 38) < 3) { a.onUpdate = null; a.path = []; a.place(-70, 0, 0); }
  for (let i = 0; i < 1 + delay; i++) await step(30);
  const pl = G.player; pl.place(route[0][0], route[0][1], 0);
  let wp = 1, t = 0, stuck = 0, last = [pl.pos.x, pl.pos.z];
  for (let f = 0; f < 30 * 20; f++) {
    const [tx, tz] = route[wp];
    if (Math.hypot(tx - pl.pos.x, tz - pl.pos.z) < 0.8 && wp < route.length - 1) wp++;
    pl.yaw = Math.atan2(-(tx - pl.pos.x), -(tz - pl.pos.z));
    E.input.keys.add("KeyW"); pl.crouched = crouch;
    E.frame(1 / 30, true); t += 1 / 30;
    if (f % 30 === 0) { await new Promise(r => setTimeout(r, 0)); if (Math.hypot(pl.pos.x - last[0], pl.pos.z - last[1]) < 0.2) stuck++; last = [pl.pos.x, pl.pos.z]; }
    if (G.lockMove || G.chapter !== 4 || stuck > 3) break;
  }
  E.input.keys.clear();
  const d = Math.hypot(pl.pos.x + 27.5, pl.pos.z - 67.2);
  return { made: d < 2.6, caught: G.lockMove && d >= 2.6, stuck: stuck > 3, t: +t.toFixed(1) };
}
