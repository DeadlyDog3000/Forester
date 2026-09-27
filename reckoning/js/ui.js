// ===========================================================================
//  FORESTER: RECKONING — Copyright (c) 2026 Roan Fraese / DeadlyDog Productions
// ===========================================================================

// Everything drawn over the world: the black between scenes, chapter cards,
// who is speaking, what to do next, and the one-key prompt for the thing in
// front of you.

export const $ = id => document.getElementById(id);
const sleep = ms => new Promise(r => setTimeout(r, ms));

export const UI = {
  dialogOpen: false,
  _advance: null,
  _barkTimer: null,

  show(id, on = true) { $(id).classList.toggle("hidden", !on); },

  // the curtain: 0 is clear, 1 is black
  fade(to, secs = 1) {
    const f = $("fade");
    f.style.transition = `opacity ${secs}s ease`;
    // force the transition to start from wherever it is
    void f.offsetWidth;
    f.style.opacity = to;
    return sleep(secs * 1000 + 30);
  },
  fadeNow(v) { const f = $("fade"); f.style.transition = "none"; f.style.opacity = v; void f.offsetWidth; },

  async card(kicker, title, secs = 3.2) {
    const c = $("card");
    $("cardKicker").textContent = kicker || "";
    $("cardTitle").textContent = title || "";
    c.classList.remove("hidden");
    c.style.opacity = 0; void c.offsetWidth;
    c.style.transition = "opacity 1.1s ease"; c.style.opacity = 1;
    await sleep(secs * 1000);
    c.style.opacity = 0;
    await sleep(1100);
    c.classList.add("hidden");
  },

  // A line of narration on black, the way the first game told its opening.
  async narrate(text, secs) {
    const n = $("narration");
    n.textContent = text;
    n.classList.remove("hidden");
    n.style.opacity = 0; void n.offsetWidth;
    n.style.transition = "opacity 1s ease"; n.style.opacity = 1;
    await sleep((secs ?? Math.max(3.2, text.length * 0.06)) * 1000);
    n.style.opacity = 0;
    await sleep(1000);
    n.classList.add("hidden");
  },

  // Blocking dialogue: resolves when the player moves it on.
  say(name, text, cls = "") {
    const d = $("dialog");
    $("dlgName").textContent = name || "";
    $("dlgName").className = "dlg-name " + cls;
    $("dlgText").textContent = text;
    $("dlgText").classList.toggle("italic", !name);
    d.classList.remove("hidden");
    this.dialogOpen = true;
    const now = () => (window.G ? window.G.time : performance.now() / 1000);
    const shownAt = now();
    return new Promise(res => {
      this._advance = () => {
        if (now() - shownAt < 0.25) return false;   // no skipping by a held key
        d.classList.add("hidden");
        this.dialogOpen = false;
        this._advance = null;
        res();
        return true;
      };
    });
  },
  advance() { return this._advance ? this._advance() : false; },
  closeDialog() { if (this._advance) { $("dialog").classList.add("hidden"); this.dialogOpen = false; const a = this._advance; this._advance = null; } },

  // Non-blocking subtitle: things said while you walk.
  bark(name, text, secs) {
    const b = $("bark");
    $("barkName").textContent = name ? name + ":" : "";
    $("barkText").textContent = text;
    $("barkText").classList.toggle("italic", !name);
    b.classList.remove("hidden");
    b.style.opacity = 1;
    clearTimeout(this._barkTimer);
    const t = (secs ?? Math.max(2.6, text.length * 0.065)) * 1000;
    this._barkTimer = setTimeout(() => { b.style.opacity = 0; setTimeout(() => b.classList.add("hidden"), 400); }, t);
    return sleep(t + 300);
  },
  clearBark() { clearTimeout(this._barkTimer); $("bark").classList.add("hidden"); },

  objective(text) {
    const o = $("objective");
    if (!text) { o.classList.add("hidden"); return; }
    $("objText").textContent = text;
    o.classList.remove("hidden");
    o.classList.remove("pulse"); void o.offsetWidth; o.classList.add("pulse");
  },
  objectiveCount(text) { $("objText").textContent = text; },

  prompt(text, hold = false) {
    const p = $("prompt");
    if (!text) { p.classList.add("hidden"); return; }
    $("promptKey").textContent = "E";
    $("promptText").textContent = (hold ? "Hold — " : "") + text;
    p.classList.remove("hidden");
  },
  hold(frac) {
    const h = $("holdRing");
    if (frac <= 0) { h.classList.add("hidden"); return; }
    h.classList.remove("hidden");
    h.style.setProperty("--p", Math.min(1, frac) * 360 + "deg");
  },
  carry(text) {
    const c = $("carry");
    if (!text) { c.classList.add("hidden"); return; }
    c.textContent = text; c.classList.remove("hidden");
  },
  hint(text, secs = 5) {
    const h = $("hint");
    h.textContent = text; h.classList.remove("hidden"); h.style.opacity = 1;
    clearTimeout(this._hintT);
    this._hintT = setTimeout(() => { h.style.opacity = 0; setTimeout(() => h.classList.add("hidden"), 500); }, secs * 1000);
  },
  eye(v) {
    const e = $("eye");
    if (v <= 0.01) { e.classList.add("hidden"); return; }
    e.classList.remove("hidden");
    e.style.setProperty("--v", v);
    e.classList.toggle("alarm", v > 0.7);
  },
  marker(sx, sy, dist, on, behind) {
    const m = $("marker");
    if (!on) { m.classList.add("hidden"); return; }
    m.classList.remove("hidden");
    m.style.transform = `translate(${sx}px, ${sy}px)`;
    $("markerDist").textContent = dist < 4 ? "" : Math.round(dist) + " m";
    m.classList.toggle("edge", behind);
  },
};
