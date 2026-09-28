// ===========================================================================
//  FORESTER: RECKONING — Copyright (c) 2026 Roan Fraese / DeadlyDog Productions
// ===========================================================================

// A filming rig, for the trailer and the short. Not part of the game.
//
// Load the game from the capture server (it accepts POST /__frame), then in
// the console:
//
//   const { rig } = await import("./tools/rig.js");
//   rig.setup(1920, 1080);
//   await rig.shot("harbour", 5, (t, cam) => rig.look(cam, [x, y, z], [tx, ty, tz]));
//
// Every frame of a shot is stepped at exactly 1/30 s of game time, drawn, and
// sent to the server as a numbered JPEG, so shots are smooth however slowly
// the machine renders them, and can be retaken identically.

import { frame, G } from "../js/engine.js";
import { THREE } from "../js/core.js";

const canvas = () => window.__renderer.domElement;

export const rig = {
  fps: 30,
  setup(w, h) {
    window.__manual = true;
    const r = window.__renderer, cam = window.__camera;
    r.setPixelRatio(1);
    r.setSize(w, h, false);
    cam.aspect = w / h; cam.updateProjectionMatrix();
    this.w = w; this.h = h;
    this.hud(false);
  },
  // the HUD and the hands off, for a clean frame
  hud(on) {
    const h = document.getElementById("hud"); if (h) h.style.visibility = on ? "" : "hidden";
    for (const id of ["dialog", "bark", "narration", "card", "fade", "objective", "marker", "keys", "hint"]) { const e = document.getElementById(id); if (e) e.style.visibility = on ? "" : "hidden"; }
  },
  hands(on) { this.showHands = on; for (const c of window.__camera.children) if (!c.isLight) c.visible = on; },
  // put the camera at `from`, looking at `to` (world coordinates); y is height above the ground if `ground` is set
  look(cam, from, to, fov = 50) {
    cam.position.set(from[0], from[1], from[2]);
    cam.up.set(0, 1, 0);
    cam.lookAt(to[0], to[1], to[2]);
    if (Math.abs(cam.fov - fov) > 0.01) { cam.fov = fov; cam.updateProjectionMatrix(); }
  },
  ground(x, z) { return G.world ? G.world.heightAt(x, z) : 0; },
  lerp(a, b, t) { return a.map((v, i) => v + (b[i] - v) * t); },
  ease(t) { return t * t * (3 - 2 * t); },
  // run the game without filming (to let a scene settle)
  run(secs, fn) { const n = Math.round(secs * this.fps); for (let i = 0; i < n; i++) { if (fn) G.camOverride = cam => fn(0, cam); frame(1 / this.fps, true); } G.camOverride = null; },
  async shot(name, secs, fn, { quality = 0.92, from = 0 } = {}) {
    const n = Math.round(secs * this.fps);
    for (let i = from; i < n; i++) {
      const t = n > 1 ? i / (n - 1) : 0;
      // (the game shows the hands again every frame, so they are hidden every frame)
      G.camOverride = cam => { fn(t, cam); if (!this.showHands) for (const c of cam.children) if (!c.isLight) c.visible = false; };
      frame(1 / this.fps, false);
      const url = canvas().toDataURL("image/jpeg", quality);
      await fetch(`/__frame?name=${name}/${String(i).padStart(4, "0")}.jpg`, { method: "POST", body: url });
    }
    G.camOverride = null;
    return n;
  },
};
window.rig = rig;
