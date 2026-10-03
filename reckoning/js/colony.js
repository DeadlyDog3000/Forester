// ===========================================================================
//  FORESTER: RECKONING — Copyright (c) 2026 Roan Fraese / DeadlyDog Productions
// ===========================================================================
// A NEW SETTLEMENT: after forty minutes of play, you are asked whether to found another. Say yes, and a road
// is cut out through the forest to a new clearing, with a fire ring and a signpost with its name. You build
// there as you do at home; it keeps its own stores, and its own people, who you send for.
import { THREE, mat, Builder, MAT } from "./core.js";
import { G } from "./engine.js";
import { UI } from "./ui.js";
import { CLEARING, HUNT } from "./woods.js";

export const COLONY_AFTER = 40 * 60, COLONY_R = 20;

// once, when the time has come and nothing else is happening: shall we?
export function colonyCheck(town) {
  const S = town.S;
  if (S.colonyAsked || (S.playSecs || 0) < COLONY_AFTER) return;
  if (G.mode !== "play" || UI.dialogOpen || G.cine || G.lockMove || (town.raids && town.raids.active) || (S.revolt && S.revolt.active)) return;
  if (!G.openTrade) return;
  S.colonyAsked = true; town.persist();
  const sib = G.who === "sister" ? "Brother" : "Sister";
  UI.bark(sib, "There's room out there for another settlement, you know. A day's clearing, and a road to it.", 6);
  G.openTrade("A new settlement?", "a second clearing, with a road to it", [
    { icon: "cabin", label: "Yes — found a new settlement", note: "A road is cut through the forest to a new clearing. It keeps its own stores and its own people: you build there, and send for people to live in it.", get: "", can: () => true, do: () => { G.closeTrade && G.closeTrade(); found(town); } },
    { icon: "cabin", label: "Not now", note: "You can't be asked again — this is the one chance.", get: "", can: () => true, do: () => { G.closeTrade && G.closeTrade(); } },
  ], null);
}

async function found(town) {
  const S = town.S, w = town.w;
  const name = (G.ask ? await G.ask("What will you call the new settlement?", "Neuhof") : "Neuhof") || "Neuhof";
  const spot = pick(town);
  if (!spot) { UI.hint("There's no good ground for it out there.", 4); return; }
  await UI.fade(1, 0.6);
  // (its own stores, from nothing but a cart's worth: a few logs and some rye to start; and nobody lives there till you send for them)
  const c = { name: name.slice(0, 28), x: spot.x, z: spot.z, r: COLONY_R, road: spot.road, day: town.day, store: 8, rye: 40, seed: 1 };
  (S.colonies ??= []).push(c);
  lay(town, c);
  town.persist();
  await new Promise(r => setTimeout(r, 900));
  UI.fade(0, 1.2);
  UI.news && UI.news({ title: `${c.name} is founded`, sub: "A road runs out through the forest to it, and the ground is cleared. It has its own stores — a cart's worth of logs and rye to start — and nobody lives there yet: raise cabins, then send for people to settle it (G, then People).", img: "event_war" });
  UI.hint(`A new road leads to ${c.name}. It's on the map (J).`, 6);
  G.guide && G.guide("colony");
}

// good ground a long way out: off the roads, clear of the deer ride and the cave, as far as you may go
function pick(town) {
  const w = town.w;
  let best = null;
  for (let i = 0; i < 72; i++) {
    const a = i / 72 * Math.PI * 2, d = 92, x = CLEARING.x + Math.cos(a) * d, z = CLEARING.z + Math.sin(a) * d;
    if (w.anyRoadDist(x, z).d < COLONY_R + 8) continue;
    if (Math.hypot(x - HUNT.x, z - HUNT.z) < HUNT.r + COLONY_R) continue;
    if (w.cave && w.cave.mouthAt && Math.hypot(x - w.cave.mouthAt.x, z - w.cave.mouthAt.z) < COLONY_R + 12) continue;
    if ((town.S.lobes || []).some(l => l.poly.some(p => Math.hypot(p[0] - x, p[1] - z) < COLONY_R))) continue;
    // (flattest is best)
    let rough = 0; for (let k = 0; k < 8; k++) { const b = k / 8 * Math.PI * 2; rough += Math.abs(w.heightAt(x + Math.cos(b) * 12, z + Math.sin(b) * 12) - w.heightAt(x, z)); }
    if (!best || rough < best.rough) best = { x, z, rough, a };
  }
  if (!best) return null;
  // the road: from the clearing's edge out to the new one, with a bend or two in it
  const road = [];
  const ex = CLEARING.x + Math.cos(best.a) * (CLEARING.r + 6), ez = CLEARING.z + Math.sin(best.a) * (CLEARING.r + 6);
  const n = 12;
  for (let k = 0; k <= n; k++) {
    const t = k / n, bend = Math.sin(t * Math.PI) * 9 * Math.sin(best.a * 3);
    const x = ex + (best.x - ex) * t - Math.sin(best.a) * bend, z = ez + (best.z - ez) * t + Math.cos(best.a) * bend;
    road.push([Math.round(x * 10) / 10, Math.round(z * 10) / 10]);
  }
  return { x: best.x, z: best.z, road };
}

const segDist = (x, z, [ax, az], [bx, bz]) => { const dx = bx - ax, dz = bz - az, l = dx * dx + dz * dz || 1, t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l)); return Math.hypot(x - ax - dx * t, z - az - dz * t); };
export const onRoad = (c, x, z, w = 3.2) => c.road.some((p, i) => i < c.road.length - 1 && segDist(x, z, p, c.road[i + 1]) < w);

// the clearing and the road, made in the world (again, on every load)
export function lay(town, c) {
  const w = town.w;
  w.clearScenery && w.clearScenery(c.x, c.z, c.r + 4, (x, z) => onRoad(c, x, z));
  const g = new THREE.Group();
  // the road: a strip of trodden earth, laid over the ground as it lies
  // (its edges take the colour of the ground they run over, so the road fades into the forest floor)
  const dirt = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, flatShading: true });
  const DUST = new THREE.Color(0x8a6e4e), RUT = new THREE.Color(0x6a5438), gc = new THREE.Color(), tc = new THREE.Color();
  for (let i = 0; i < c.road.length - 1; i++) {
    const [ax, az] = c.road[i], [bx, bz] = c.road[i + 1], len = Math.hypot(bx - ax, bz - az);
    const geo = new THREE.PlaneGeometry(5.4, len + 1.2, 6, Math.ceil(len / 1.5)); geo.rotateX(-Math.PI / 2);
    const ry = Math.atan2(bx - ax, bz - az), cx = (ax + bx) / 2, cz = (az + bz) / 2, co = Math.cos(ry), si = Math.sin(ry);
    const p = geo.attributes.position, col = new Float32Array(p.count * 3);
    for (let k = 0; k < p.count; k++) {
      const lx = p.getX(k), lz = p.getZ(k), x = cx + lx * co + lz * si, z = cz - lx * si + lz * co, a = Math.abs(lx) / 2.7;
      p.setY(k, w.heightAt(x, z) + 0.05 - Math.max(0, a - 0.6) * 0.1);
      w.groundColour ? w.groundColour(x, z, gc) : gc.copy(DUST);
      tc.copy(a > 0.25 && a < 0.5 ? RUT : DUST).lerp(gc, Math.min(1, Math.max(0, (a - 0.45) / 0.55)) + 0.12);
      col[k * 3] = tc.r; col[k * 3 + 1] = tc.g; col[k * 3 + 2] = tc.b;
    }
    geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
    geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, dirt); m.position.set(cx, 0, cz); m.rotation.y = ry; m.receiveShadow = true; g.add(m);
  }
  // a ring of stones for a fire, and a signpost with the name on it
  const y = w.heightAt(c.x, c.z), b = new Builder();
  for (let k = 0; k < 9; k++) { const a = k / 9 * Math.PI * 2; b.box(0.35, 0.22, 0.3, c.x + Math.cos(a) * 0.9, y + 0.1, c.z + Math.sin(a) * 0.9, 0x6a665e, a); }
  const sx = c.road[c.road.length - 1][0], sz = c.road[c.road.length - 1][1];
  b.box(0.14, 2.4, 0.14, sx + 2.2, w.heightAt(sx + 2.2, sz) + 1.2, sz, 0x5a4230);
  g.add(b.build(MAT.rough));
  const cv = document.createElement("canvas"); cv.width = 256; cv.height = 64;
  const x2 = cv.getContext("2d"); x2.fillStyle = "#c8a878"; x2.fillRect(0, 0, 256, 64); x2.strokeStyle = "#3b2612"; x2.lineWidth = 4; x2.strokeRect(2, 2, 252, 60);
  x2.fillStyle = "#2a1a0c"; x2.font = "italic 30px Georgia, serif"; x2.textAlign = "center"; x2.textBaseline = "middle"; x2.fillText(c.name, 128, 34);
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
  const sign = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.38, 0.05), [mat(0x7a5634), mat(0x7a5634), mat(0x7a5634), mat(0x7a5634), new THREE.MeshStandardMaterial({ map: tex }), new THREE.MeshStandardMaterial({ map: tex })]);
  sign.position.set(sx + 2.2, w.heightAt(sx + 2.2, sz) + 2.1, sz); sign.rotation.y = Math.atan2(c.x - sx, c.z - sz) + Math.PI / 2; g.add(sign);
  w.root.add(g);
  (town.colonyVis ??= []).push(g);
  w.colonies = town.S.colonies;
}
