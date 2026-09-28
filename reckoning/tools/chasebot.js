// A bot that runs the chapter III chase, for testing that it can be won (and lost).
// Not part of the game.
//   const { chaseBot } = await import("./tools/chasebot.js");
//   await chaseBot(route, { sprintRule })
import * as E from "../js/engine.js";
import { UI } from "../js/ui.js";

const G = E.G;
export async function chaseBot(route, { sprintRule, secs = 30 } = {}) {
  const errs = [];
  const onErr = e => errs.push(e.message || String(e.reason));
  addEventListener("error", onErr);
  window.__manual = true;
  window.__play(3, "brother", { chase: true });
  const step = async n => { for (let i = 0; i < n; i++) { E.frame(1 / 30, true); if (UI.dialogOpen && UI._advance) { UI._advance(); UI._advance(); } } await new Promise(r => setTimeout(r, 0)); };
  // wait for control
  let k = 0;
  while ((G.lockMove || !G.player || G.chapter !== 3 || G.sprintSpeed !== 6.2) && k++ < 600) await step(5);
  const pl = G.player;
  let wp = 0, t = 0, closest = 99;
  const log = [];
  for (let f = 0; f < 30 * secs; f++) {
    const [tx, tz] = route[wp];
    if (Math.hypot(tx - pl.pos.x, tz - pl.pos.z) < 1.2 && wp < route.length - 1) wp++;
    pl.yaw = Math.atan2(-(tx - pl.pos.x), -(tz - pl.pos.z)); pl.pitch = 0;
    E.input.keys.add("KeyW");
    if (!sprintRule || sprintRule(pl)) E.input.keys.add("ShiftLeft"); else E.input.keys.delete("ShiftLeft");
    E.frame(1 / 30, true); t += 1 / 30;
    for (const a of G.chasers || []) closest = Math.min(closest, Math.hypot(a.pos.x - pl.pos.x, a.pos.z - pl.pos.z));
    if (UI.dialogOpen && UI._advance) UI._advance();
    if (f % 15 === 0) { log.push([+pl.pos.x.toFixed(1), +pl.pos.z.toFixed(1), +(G.stamina ?? 1).toFixed(2)]); await new Promise(r => setTimeout(r, 0)); }
    if (G.chapter !== 3 || G.lockMove) break;
  }
  E.input.keys.clear();
  const won = G.chapter === 4 || (!G.lockMove ? false : pl.pos.z > 52);
  await step(20);
  removeEventListener("error", onErr);
  return { t: +t.toFixed(1), won: G.chapter === 4 || won, chapter: G.chapter, end: [+pl.pos.x.toFixed(1), +pl.pos.z.toFixed(1)], closest: +closest.toFixed(2), log: log.slice(-3), errs };
}
