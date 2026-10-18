// ===========================================================================
//  FORESTER: RECKONING — Copyright (c) 2026 Roan Fraese / DeadlyDog Productions
// ===========================================================================

// The lie of the land in Europe: where the mountains run and how high, from the
// real ranges (their heights sketched, not surveyed). The 3D land is raised
// from it, and the map shades its mountains by it, so the two always agree.

// ---- noise ----
export function hash(x, y, s) { let h = (x * 374761393 + y * 668265263 + s * 1442695041) | 0; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
export function vnoise(x, y, s) {
  const xi = Math.floor(x), yi = Math.floor(y); let fx = x - xi, fy = y - yi;
  fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy);
  const a = hash(xi, yi, s), b = hash(xi + 1, yi, s), c = hash(xi, yi + 1, s), d = hash(xi + 1, yi + 1, s);
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
}
export const fbm = (x, y, s, oct = 4) => { let v = 0, a = 0.5, f = 1; for (let i = 0; i < oct; i++) { v += a * vnoise(x * f, y * f, s + i * 17); a *= 0.5; f *= 2.03; } return v; };

// ---- the mountains: ranges as lines (lon, lat), a height in km, a width in degrees ----
export const RANGES = [
  [[[5.9, 44.3], [6.9, 45.5], [7.6, 45.9], [8.5, 46.4], [9.5, 46.5], [10.5, 46.6], [11.5, 47], [12.5, 47.1], [13, 47.1]], 3.1, 0.55],
  // (the eastern Alps, lower as they run out toward Wien: the Rax and the Schneeberg are two thousand metres, not four
  //  — at the western Alps' height the hills south of the city lay under a field of snow)
  [[[13.6, 47.2], [14.5, 47.35], [15.3, 47.55], [15.9, 47.7]], 1.8, 0.4],
  [[[-1.8, 43.1], [0, 42.7], [1, 42.6], [2.5, 42.4]], 2.6, 0.35],
  [[[17.5, 48.8], [19, 49.3], [21, 49.3], [22.5, 49], [23.8, 48.2], [24.8, 47.6], [25.6, 46.8], [25.9, 45.8], [25, 45.4], [23.5, 45.4], [22.3, 45.1]], 1.9, 0.45],
  [[[6, 58.5], [7, 59.8], [8, 61], [9.5, 62], [11, 63], [12.5, 64], [14, 65.5], [15.5, 66.5]], 1.25, 0.7],
  [[[8.5, 44.4], [10, 44.2], [11.5, 43.8], [12.6, 43.3], [13.6, 42.3], [14.5, 41.5], [15.5, 40.6], [16.2, 39.5], [16.1, 38.6]], 1.9, 0.35],
  [[[14.8, 45.3], [16, 44], [17.5, 43.5], [18.8, 43], [19.8, 42.5], [20.8, 41.8], [21.5, 40.5], [21.8, 39.3], [22.3, 38.2]], 2, 0.5],
  [[[22.5, 43.6], [24, 42.8], [26, 42.7], [27.5, 42.6]], 1.6, 0.35], [[[23.5, 41.7], [24.8, 41.6]], 1.8, 0.35],
  [[[-9, 31], [-6, 32], [-4.5, 33], [-3, 33.7], [-1, 34.3], [1, 35.2], [3, 36], [5, 36], [7, 35.5], [9, 35.3]], 2.8, 0.6],
  [[[37.5, 44.3], [40, 43.5], [42, 43], [44, 42.6]], 3.6, 0.4],
  [[[29, 37], [32, 36.6], [35, 37.3], [38, 38], [41, 38.4]], 2.5, 0.4], [[[31, 41.3], [35, 41.2], [39, 40.7], [42, 41]], 2, 0.35],
  [[[-4, 37.1], [-2.8, 37.1]], 3, 0.25], [[[-7, 43], [-5, 43.1], [-3.5, 43.1]], 2.2, 0.3], [[[-6.5, 40.3], [-4, 40.8], [-3, 41]], 2, 0.3],
  [[[2.5, 45.2], [3, 44.8], [3.5, 45.5]], 1.0, 0.4], [[[7, 48.3], [8.2, 48]], 1.2, 0.3], [[[5.8, 46.4], [7, 47.2]], 1.3, 0.3],
  [[[12.3, 50.4], [13.6, 50.6]], 1.1, 0.3], [[[15, 50.8], [16.5, 50.4]], 1.3, 0.3], [[[12.5, 49.4], [13.8, 48.8]], 1.2, 0.3],
  [[[-5.5, 56.8], [-4.5, 57.1], [-3.5, 57.1], [-4.5, 58.2]], 1.1, 0.5], [[[-3.8, 52.5], [-3.6, 51.9]], 0.9, 0.3], [[[-2.2, 53.5], [-2.3, 54.6]], 0.7, 0.3],
  [[[33.8, 44.6], [34.6, 44.8]], 1.2, 0.2], [[[9, 42.2], [9.1, 40.1]], 1.8, 0.25], [[[15, 37.75], [15, 37.76]], 3.2, 0.15],
  [[[4.5, 60], [6.5, 61.5], [7.5, 62.5]], 0.8, 0.4],
  // the New World: the Appalachians, the Adirondacks, the White Mountains, the Laurentians, the Ozarks, the Long Range of
  // Newfoundland, the Notre Dames of the Gaspé, the Sierra Madre Oriental, and the Cuban Sierra
  [[[-85.5, 33.8], [-84.2, 34.9], [-83.0, 35.7], [-81.6, 36.6], [-80.2, 37.8], [-78.9, 39.0], [-77.8, 40.1], [-76.6, 41.2], [-75.3, 42.0], [-74.3, 42.2]], 1.5, 0.75],
  [[[-74.8, 43.8], [-74.0, 44.3]], 1.3, 0.35], [[[-71.7, 44.0], [-71.2, 44.4], [-70.6, 45.0]], 1.5, 0.3], [[[-72.9, 43.0], [-72.8, 44.6]], 1.0, 0.25],
  [[[-76.0, 46.4], [-73.5, 46.9], [-71.5, 47.5], [-69.5, 48.4]], 0.95, 0.55], [[[-94.0, 35.8], [-92.0, 37.2]], 0.6, 0.6],
  [[[-57.8, 49.3], [-56.8, 50.8]], 0.7, 0.25], [[[-67.5, 48.6], [-65.2, 48.9]], 1.0, 0.3], [[[-99.6, 21.2], [-99.9, 23.5], [-100.0, 25.6]], 2.4, 0.5],
];
// plateaus: a rise over a box, softened at its edges
export const PLATEAUS = [[-7, 38.2, -1.5, 42.5, 0.65], [29, 37, 44, 41, 0.9], [-9, 29, 9, 35, 0.5]];
export function segDist(px, py, ax, ay, bx, by) { const dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy || 1e-9; const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / L)); return Math.hypot(px - ax - dx * t, py - ay - dy * t); }
// how high the mountains stand at a place, in km (the ranges and the high plateaus; no lowland roll)
export function mountainKm(lon, lat, K) {
  let h = 0;
  for (const [pts, km, w] of RANGES) {
    let d = Infinity;
    for (let i = 1; i < pts.length; i++) d = Math.min(d, segDist(lon * K, lat, pts[i - 1][0] * K, pts[i - 1][1], pts[i][0] * K, pts[i][1]));
    if (d < w * 3) h += km * Math.exp(-(d * d) / (2 * w * w)) * (0.6 + fbm(lon * 4, lat * 4, 11) * 0.7);
  }
  for (const [x0, y0, x1, y1, km] of PLATEAUS) {
    const ex = Math.min(lon - x0, x1 - lon), ey = Math.min(lat - y0, y1 - lat);
    if (ex > 0 && ey > 0) h += km * Math.min(1, Math.min(ex, ey) / 0.8);
  }
  return h;
}
// the ranges alone (no roughness), each passed over quickly where it's far off: for shading the map
const BOXES = RANGES.map(([pts, , w]) => { const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]), m = w * 3; return [Math.min(...xs) - m * 2, Math.max(...xs) + m * 2, Math.min(...ys) - m, Math.max(...ys) + m]; });
export function rangeKm(lon, lat, K) {
  let h = 0;
  for (let r = 0; r < RANGES.length; r++) {
    const b = BOXES[r]; if (lon < b[0] || lon > b[1] || lat < b[2] || lat > b[3]) continue;
    const [pts, km, w] = RANGES[r]; let d = Infinity;
    for (let i = 1; i < pts.length; i++) d = Math.min(d, segDist(lon * K, lat, pts[i - 1][0] * K, pts[i - 1][1], pts[i][0] * K, pts[i][1]));
    if (d < w * 3) h += km * Math.exp(-(d * d) / (2 * w * w));
  }
  return h;
}
