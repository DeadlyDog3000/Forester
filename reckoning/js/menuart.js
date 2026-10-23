// ===========================================================================
//  FORESTER: RECKONING — Copyright (c) 2026 Roan Fraese / DeadlyDog Productions
// ===========================================================================

// THE MAIN MENU'S BACKDROP — paintings of the 1680s, as the Dutch masters of
// battle and the sea painted them, each giving way to the next through a
// drift of powder smoke: the standards over the line, a charge, Hamburg's
// harbour at dusk, the relief of Vienna, two ships at their broadsides, a
// stockade in the forest, and the burned cabin where it all begins. Each one
// drawn slowly closer while it shows. Only while the menu's backdrop is up.

const SCENES = ["art/menu/standards.jpg", "art/menu_painted.jpg", "art/menu/charge.jpg", "art/menu/hamburg.jpg",
  "art/menu/vienna.jpg", "art/menu/broadside.jpg", "art/menu/stockade.jpg"];
const HOLD = 11000;      // (how long each painting shows, in ms; the smoke and the crossfade take about three seconds of it)

export function startMenuArt() {
  const host = document.getElementById("menus");
  if (!host || document.getElementById("menuArt")) return;
  const box = document.createElement("div"); box.id = "menuArt"; box.setAttribute("aria-hidden", "true");
  const layers = SCENES.map(src => { const d = document.createElement("div"); d.className = "ma-scene"; d.dataset.src = src; box.appendChild(d); return d; });
  // (two banks of smoke, drifting different ways at different speeds; thicker as one painting gives way to the next)
  for (let i = 0; i < 2; i++) {
    const s = document.createElement("div"); s.className = `ma-smoke ma-smoke${i}`;
    const tex = smokeTex(i); if (tex) s.style.backgroundImage = `url(${tex})`;
    box.appendChild(s);
  }
  host.prepend(box);
  let n = 0, timer = null, first = true;
  // (each painting fetched only as it comes due, and the next one with it, so it's there when wanted)
  const load = d => { if (!d.style.backgroundImage) d.style.backgroundImage = `url("${d.dataset.src}")`; };
  const show = k => {
    load(layers[k]); load(layers[(k + 1) % layers.length]);
    layers.forEach((d, j) => d.classList.toggle("on", j === k));
    if (first) { first = false; return; }
    box.classList.add("puff"); setTimeout(() => box.classList.remove("puff"), 2600);
  };
  const run = () => {
    const on = host.classList.contains("backdrop") && getComputedStyle(host).display !== "none";
    if (on && !timer) { show(n); timer = setInterval(() => { n = (n + 1) % layers.length; show(n); }, HOLD); }
    else if (!on && timer) { clearInterval(timer); timer = null; }
  };
  new MutationObserver(run).observe(host, { attributes: true, attributeFilter: ["class", "style"] });
  run();
}

// a bank of smoke, drawn once: soft puffs of white, many and overlapping, thicker toward the middle, the edges
// matched so it tiles along its length as it drifts
function smokeTex(seed) {
  if (typeof document === "undefined") return null;
  const W = 1024, H = 512, cv = document.createElement("canvas"); cv.width = W; cv.height = H;
  const c = cv.getContext("2d");
  let s = 9301 + seed * 4973; const R = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 140; i++) {
    const x = R() * W, y = H * (0.25 + 0.5 * R()) + (R() - 0.5) * H * 0.3, r = 40 + R() * 150, a = 0.05 + R() * 0.09;
    for (const dx of [-W, 0, W]) {
      const g = c.createRadialGradient(x + dx, y, 0, x + dx, y, r);
      g.addColorStop(0, `rgba(236,230,218,${a})`); g.addColorStop(0.6, `rgba(220,214,202,${a * 0.5})`); g.addColorStop(1, "rgba(210,204,194,0)");
      c.fillStyle = g; c.fillRect(x + dx - r, y - r, r * 2, r * 2);
    }
  }
  return cv.toDataURL("image/png");
}
