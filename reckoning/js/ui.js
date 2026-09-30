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
    this.typeInto(n, text, { cps: 34, click: 0.7 });
    n.classList.remove("hidden");
    n.style.opacity = 0; void n.offsetWidth;
    n.style.transition = "opacity 1s ease"; n.style.opacity = 1;
    await sleep((secs ?? Math.max(3.2, text.length * 0.06)) * 1000);
    n.style.opacity = 0;
    await sleep(1000);
    n.classList.add("hidden");
  },

  // Blocking dialogue: resolves when the player moves it on.
  // write text into an element a letter at a time, with a small click for each, a breath after
  // commas and full stops; returns { done() finishes it at once, typing }
  typeInto(el, text, { cps = 42, click = 1 } = {}) {
    clearTimeout(el._typer);
    el.textContent = "";
    let i = 0;
    const next = () => {
      if (i >= text.length) return;
      const ch = text[i++];
      el.textContent = text.slice(0, i);
      if (click && ch.trim() && window.__audio) window.__audio.letter(click);
      el._typer = setTimeout(next, (1000 / cps) * (/[.!?]/.test(ch) ? 7 : /[,;:—]/.test(ch) ? 3.5 : 1));
    };
    next();
    return { done() { clearTimeout(el._typer); el.textContent = text; i = text.length; }, get typing() { return i < text.length; } };
  },
  say(name, text, cls = "") {
    const d = $("dialog");
    $("dlgName").textContent = name || "";
    $("dlgName").className = "dlg-name " + cls;
    $("dlgText").classList.toggle("italic", !name);
    d.classList.remove("hidden");
    this.dialogOpen = true;
    const typer = this.typeInto($("dlgText"), text);
    const now = () => (window.G ? window.G.time : performance.now() / 1000);
    const shownAt = now();
    return new Promise(res => {
      this._advance = () => {
        if (now() - shownAt < 0.25) return false;   // no skipping by a held key
        // the first press finishes the line; the next moves on
        if (typer.typing) { typer.done(); return false; }
        d.classList.add("hidden");
        this.dialogOpen = false;
        this._advance = null;
        res();
        return true;
      };
    });
  },
  advance() { return this._advance ? this._advance() : false; },
  closeDialog() { clearTimeout($("dlgText")._typer); if (this._advance) { $("dialog").classList.add("hidden"); this.dialogOpen = false; const a = this._advance; this._advance = null; } },

  // Non-blocking subtitle: things said while you walk.
  bark(name, text, secs) {
    const b = $("bark");
    $("barkName").textContent = name ? name + ":" : "";
    this.typeInto($("barkText"), text, { cps: 48, click: 0.55 });
    $("barkText").classList.toggle("italic", !name);
    b.classList.remove("hidden");
    b.style.opacity = 1;
    // (a new line cancels the last one's fade-out too — or, following close behind it, it would be hidden while it was still being spoken)
    clearTimeout(this._barkTimer); clearTimeout(this._barkHide);
    const t = (secs ?? Math.max(2.6, text.length * 0.065)) * 1000;
    this._barkTimer = setTimeout(() => { b.style.opacity = 0; this._barkHide = setTimeout(() => b.classList.add("hidden"), 400); }, t);
    return sleep(t + 300);
  },
  clearBark() { clearTimeout(this._barkTimer); clearTimeout(this._barkHide); $("bark").classList.add("hidden"); },

  // the red screen: a headline, what happened, and a quote that writes itself in
  async caught(head, line, quote, by, tip) {
    const c = $("caught");
    $("caughtHead").textContent = head; $("caughtLine").textContent = line;
    $("caughtQuote").textContent = ""; $("caughtBy").textContent = by; $("caughtTip").textContent = tip;
    $("caughtBy").style.opacity = 0; $("caughtTip").style.opacity = 0;
    c.classList.remove("hidden"); c.style.opacity = 0; void c.offsetWidth; c.style.opacity = 1;
    await sleep(900);
    for (let i = 1; i <= quote.length; i++) { $("caughtQuote").textContent = quote.slice(0, i); await sleep(38); }
    $("caughtBy").style.opacity = 1;
    await sleep(900);
    $("caughtTip").style.opacity = 1;
    await sleep(2600);
    this.fadeNow(1);
    c.style.opacity = 0;
    await sleep(500);
    c.classList.add("hidden");
  },
  stamina(v, winded = false) {
    const s = $("stamina");
    if (v === undefined || v === null) { s.classList.add("hidden"); return; }
    s.classList.remove("hidden"); s.style.setProperty("--s", v);
    s.classList.toggle("low", !!winded); s.classList.toggle("warn", !winded && v < 0.25);
  },

  // health and hunger, always in sight while you play (v null hides them both)
  vitals(hp, food, nomap) {
    const el = $("vitals"); if (!el) return;
    if (hp === undefined || hp === null) { el.classList.add("hidden"); this._hp = null; return; }
    el.classList.remove("hidden"); el.classList.toggle("nomap", !!nomap);
    this.health(hp);
    const g = $("hunger"); g.style.setProperty("--f", food ?? 1); g.classList.toggle("low", (food ?? 1) < 0.25);
  },
  health(v) {
    const h = $("health"); if (!h) return;
    if (v === undefined || v === null) { this._hp = null; return; }
    h.style.setProperty("--h", v);
    // the pale trail waits at the old mark, then follows down (and jumps up with a heal)
    if (this._hp == null || v > this._hp) h.style.setProperty("--t", v);
    else if (v < this._hp - 0.001) requestAnimationFrame(() => h.style.setProperty("--t", v));
    this._hp = v;
    h.classList.toggle("low", v < 0.3);
  },
  // the arrow for the stroke you are about to make (null: none)
  swingArrow(dir) {
    if (dir === this._sa) return;
    this._sa = dir;
    const el = $("swingArrow"); if (!el) return;
    el.classList.toggle("hidden", !dir);
    for (const d of ["up", "left", "right"]) el.querySelector("." + d).classList.toggle("on", d === dir);
  },
  // the fight's three directions: yours, where his blow is coming, and which side he guards
  stance(st) {
    const el = $("stance"); if (!el) return;
    if (!st) { el.classList.add("hidden"); return; }
    el.classList.remove("hidden");
    for (const d of ["up", "left", "right"]) {
      const c = el.querySelector("." + d);
      c.classList.toggle("on", st.mine === d); c.classList.toggle("threat", st.threat === d); c.classList.toggle("foe", st.foe === d);
    }
  },
  // word from afar: one card at a time, each for a while
  news(n) {
    (this._newsQ ??= []).push(n);
    if (!this._newsOn) this._nextNews();
  },
  _nextNews() {
    const el = $("news"), n = this._newsQ.shift();
    if (!n) { this._newsOn = false; el.classList.add("hidden"); return; }
    this._newsOn = true;
    $("newsImg").src = `../assets/sprites/ui/${n.img || "event_war"}.png`;
    $("newsTitle").textContent = n.title; $("newsSub").textContent = n.sub || "";
    el.classList.remove("hidden"); el.style.opacity = 1;
    clearTimeout(this._newsT);
    const next = () => { el.style.opacity = 0; this._newsT = setTimeout(() => this._nextNews(), 400); };
    el.onclick = () => { clearTimeout(this._newsT); next(); };
    this._newsT = setTimeout(next, 7000);
  },
  hurt(k = 0.6) {
    const f = $("hurtFx"); if (!f) return;
    f.style.transition = "none"; f.style.opacity = k;
    requestAnimationFrame(() => { f.style.transition = "opacity 0.6s ease-out"; f.style.opacity = 0; });
  },

  objective(text) {
    const o = $("objective");
    if (!text) { o.classList.add("hidden"); this._obj = null; return; }
    $("objText").textContent = text;
    // set every frame with a count or a clock in it: only a new task (not a new number) pulses
    const key = text.replace(/[\d:%]+/g, "#");
    if (key === this._obj && !o.classList.contains("hidden")) return;
    this._obj = key;
    o.classList.remove("hidden");
    o.classList.remove("pulse"); void o.offsetWidth; o.classList.add("pulse");
  },
  objectiveCount(text) { $("objText").textContent = text; },

  prompt(text, hold = false) {
    const p = $("prompt");
    if (!text) { p.classList.add("hidden"); return; }
    $("promptKey").textContent = "F";
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
    this.carrying = text || null;
    const c = $("carry");
    if (!text) { c.classList.add("hidden"); return; }
    c.textContent = text; c.classList.remove("hidden");
  },
  // a strip of keys and what they do: [["W","A","S","D"], "walk"], ["Shift", "run"] ...
  keys(parts, secs = 7) {
    const k = $("keys");
    k.innerHTML = parts.map(([keys, what]) => `<span class="kp">${[].concat(keys).map(x => `<kbd>${x}</kbd>`).join("")}<span>${what}</span></span>`).join("");
    k.classList.remove("hidden"); k.style.opacity = 1;
    clearTimeout(this._keysT); clearTimeout(this._keysHide);
    this._keysT = setTimeout(() => { k.style.opacity = 0; this._keysHide = setTimeout(() => k.classList.add("hidden"), 500); }, secs * 1000);
  },
  hint(text, secs = 5) {
    const h = $("hint");
    h.textContent = text; h.classList.remove("hidden"); h.style.opacity = 1;
    clearTimeout(this._hintT); clearTimeout(this._hintHide);
    this._hintT = setTimeout(() => { h.style.opacity = 0; this._hintHide = setTimeout(() => h.classList.add("hidden"), 500); }, secs * 1000);
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
