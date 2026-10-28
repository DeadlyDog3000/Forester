// ===========================================================================
//  FORESTER: RECKONING — Copyright (c) 2026 Roan Fraese / DeadlyDog Productions
// ===========================================================================

// who's asking: the address a request came from, for the rate limits (never written down). Behind Caddy, the https
// proxy on this same machine, every request comes from 127.0.0.1, so there — and only there — the address Caddy puts in
// X-Forwarded-For is the caller's (the last one in it: Caddy's own, not one the caller could have sent)
module.exports = function ipOf(req) {
  const a = (req.socket && req.socket.remoteAddress) || "x";
  if (/^(::ffff:)?127\.0\.0\.1$|^::1$/.test(a)) {
    const f = String(req.headers["x-forwarded-for"] || "").split(",").map(s => s.trim()).filter(Boolean);
    if (f.length) return f[f.length - 1];
  }
  return a;
};
