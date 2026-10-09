// ===========================================================================
//  FORESTER: RECKONING — Copyright (c) 2026 Roan Fraese / DeadlyDog Productions
// ===========================================================================

// THE WIRE TO A SERVER, and finding servers: the wide world's, the games hosted on your own network (heard through the
// app, see shell.js), and any typed in by address.

import { PROTOCOL } from "./rules.js";

// where the wide world lives. (Set once it's up; a tester can point the game elsewhere with
// localStorage "reckoning.mp.global" = "wss://host:port".)
export const DEFAULT_GLOBAL = "";
export function globalServer() {
  let u = "";
  try { u = localStorage.getItem("reckoning.mp.global") || ""; } catch (e) {}
  return u || DEFAULT_GLOBAL;
}
// who you are, to every server: a secret kept on this computer (the servers only ever see a hash of it)
export function myToken() {
  try {
    let t = localStorage.getItem("reckoning.mp.token");
    if (!t || t.length < 16) { const a = new Uint8Array(16); crypto.getRandomValues(a); t = [...a].map(b => b.toString(16).padStart(2, "0")).join(""); localStorage.setItem("reckoning.mp.token", t); }
    return t;
  } catch (e) { return "anonymous-" + Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2); }
}
// "host:port", "ws://…", "https://…" → {ws, http}
export function addressOf(s) {
  s = String(s || "").trim(); if (!s) return null;
  if (!/^[a-z]+:\/\//i.test(s)) s = (/^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(s) ? "ws://" : "wss://") + s;
  let u; try { u = new URL(s); } catch (e) { return null; }
  const secure = u.protocol === "wss:" || u.protocol === "https:";
  if (!u.port && !secure) u.port = "47810";
  const hostport = u.host;
  return { ws: (secure ? "wss://" : "ws://") + hostport, http: (secure ? "https://" : "http://") + hostport, label: hostport };
}
// what a server has going: its games (and the wide world, if it keeps one)
export async function listRooms(addr, ms = 2500) {
  const ac = new AbortController(), t = setTimeout(() => ac.abort(), ms);
  try { const r = await fetch(addr.http + "/rooms", { signal: ac.signal, cache: "no-store" }); return r.ok ? await r.json() : null; }
  catch (e) { return null; }
  finally { clearTimeout(t); }
}

export class Net {
  constructor(addr) { this.addr = addr; this.ws = null; this.on = {}; this.open = false; this.pid = null; this.closedByUs = false; }
  connect(name, look) {
    return new Promise((ok, no) => {
      let done = false;
      const fail = text => { if (!done) { done = true; no(new Error(text)); } };
      let ws; try { ws = this.ws = new WebSocket(this.addr.ws); } catch (e) { return fail("Couldn't reach that server."); }
      const to = setTimeout(() => { fail("The server didn't answer."); try { ws.close(); } catch (e) {} }, 6000);
      ws.onopen = () => { this.open = true; this.send({ t: "hello", v: PROTOCOL, token: myToken(), name, look }); };
      ws.onerror = () => { clearTimeout(to); fail("Couldn't reach that server."); };
      ws.onclose = () => { this.open = false; clearTimeout(to); fail("The server closed the connection."); if (done && !this.closedByUs && this.on.lost) this.on.lost(); };
      ws.onmessage = e => {
        let m; try { m = JSON.parse(e.data); } catch (er) { return; }
        if (m.t === "hi" && !done) { done = true; clearTimeout(to); this.pid = m.pid; this.server = m.server; ok(m); return; }
        if (m.t === "err" && m.fatal && !done) { clearTimeout(to); fail(m.text); return; }
        const f = this.on[m.t]; if (f) f(m);
        if (this.on.any) this.on.any(m);
      };
    });
  }
  send(o) { if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify(o)); }
  // wait for the next message of a kind (or an error), once
  next(t, ms = 8000) {
    return new Promise((ok, no) => {
      const prevT = this.on[t], prevE = this.on.err;
      const done = () => { this.on[t] = prevT; this.on.err = prevE; clearTimeout(to); };
      const to = setTimeout(() => { done(); no(new Error("The server didn't answer.")); }, ms);
      this.on[t] = m => { done(); ok(m); };
      this.on.err = m => { done(); no(new Error(m.text)); };
    });
  }
  close() { this.closedByUs = true; try { this.ws && this.ws.close(); } catch (e) {} }
}

// the app's own powers (hosting a game on your network, and hearing the others), when there is an app
export const HOST = typeof window !== "undefined" ? window.reckoningHost || null : null;
