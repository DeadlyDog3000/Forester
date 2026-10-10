// ===========================================================================
//  FORESTER: RECKONING — Copyright (c) 2026 Roan Fraese / DeadlyDog Productions
// ===========================================================================

// CLASSIC: A NATION EACH. Every player plays the real free play, all of it — building, stores, research, settlers,
// Europe, raiders — in a save of their own, and is the whole authority over it. What passes between the nations
// goes through the server: how each stands, alliances, wars, trade and gifts, and war parties. A war party is so many
// of your own people, gone from your settlement down the road; in the enemy's game they come up its road as a real
// raid, fought by the same code as any other, and its game tells yours how many fell and what the rest carried home.
//
// Nothing can be done to a nation whose player isn't here: its game isn't running, and the server won't allow it.

import { G } from "../engine.js";
import { UI, $ } from "../ui.js";
import { ColonyBase, ColonyGuest } from "./colony.js";
import { NATION_GOODS } from "./rules.js";
import { lookOpts } from "./look.js";
import { nameTag } from "./mpgame.js";
import { AUDIO } from "../audio.js";

const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const GOODS = Object.keys(NATION_GOODS);
const list = g => Object.entries(g || {}).filter(([, v]) => v > 0).map(([k, v]) => `${v} ${NATION_GOODS[k] || k}`).join(", ") || "nothing";
const ago = at => { const m = Math.round((Date.now() - at) / 60000); return m < 1 ? "just now" : m < 60 ? `${m} min ago` : `${Math.round(m / 60)} h ago`; };
const NEWS_K = { war: "War", peace: "Peace", ally: "Alliance", trade: "Trade", grow: "Growing", capture: "Taken", death: "A death" };

export class NationGame extends ColonyBase {
  constructor(net, inMsg, me, hooks) {
    super(net, inMsg, me);
    this.mode = "nations"; this.hooks = hooks || {};
    this.nats = inMsg.nats || {}; this.pacts = new Set(inMsg.pacts || []); this.nwars = inMsg.nwars || []; this.offers = new Map((inMsg.offers || []).map(o => [o.id, o]));
    this.news = (inMsg.news || []).slice(); this.asks = [];
    for (const c of inMsg.chat || []) this.chatLine(c, true);
    G.mp = this; this.ownSave = true;   // (your nation is a save of its own: what you carry is kept in it)
    G.achEvent && G.achEvent("mp-join");
    if (inMsg.room.hostPid === this.pid || inMsg.room.host === me.name) G.achEvent && G.achEvent("mp-host");
    this.later = [];
    this.listen();
    // (a new nation is named for whoever founded it — the others see the name, and two "Forester's Clearing"s would be one too many; rename it in the government as ever)
    if (this.S && (!this.S.name || /^Forester's Clearing$|^The clearing$/i.test(this.S.name))) { this.S.name = `${me.name}'s Clearing`; G.town.persist(); }
    // (goods set aside for an offer, or people sent to war, in a game that ended before they came back: home now)
    this.settleOld();
    this.tickFn = dt => this.tick(dt);
    G.onFrame.push(this.tickFn);
    this.hud(true);
    this.panel();
    this.chatLine({ name: "", text: "Your nation is in the game. N for the nations: trade, alliances, war. Everything else is your settlement, as in free play." });
    this.status(true);
  }
  // what the server says (set again after a battle, whose screens borrow some of these for a while)
  listen() {
    this.listenCommon();
    const n = this.net.on;
    n.nstate = m => { this.nats = m.nats || {}; this.pacts = new Set(m.pacts || []); this.nwars = m.nwars || []; this.offers = new Map((m.offers || []).map(o => [o.id, o])); this.redraw(); };
    n.news = m => { this.news.push(m.n); if (this.news.length > 80) this.news.shift(); this.ticker(m.n); this.redraw(); };
    n.ask = m => { this.asks = this.asks.filter(a => !(a.kind === m.kind && a.from === m.from)); this.asks.push(m); this.toast(m.kind === "pact" ? `${m.name} offers you an alliance. N to answer.` : `${m.name} sues for peace. N to answer.`); this.redraw(); };
    n.offer = m => { this.offers.set(m.o.id, m.o); if (m.o.to === this.pid) this.toast(`${m.o.fromName} ${Object.keys(m.o.want).length ? "offers a trade" : "sends you a gift"}: ${list(m.o.give)}. N to answer.`); this.redraw(); };
    n.offergone = m => { this.offers.delete(m.id); this.redraw(); };
    n.got = m => this.got(m);
    n.raided = m => this.raided(m);
    n.raidBack = m => this.warbandHome(m);
    n.ended = m => this.hooks.lost && (this.leave(true), this.hooks.lost(m.text));
    n.lost = () => { if (G.mp !== this) return; this.leave(true); this.hooks.lost && this.hooks.lost("The connection to the server was lost. Your nation is saved; host or join again to carry on."); };
    n.foray = m => { const S = this.S; if (S && S.warband && !S.warband.id) { S.warband.id = m.id; G.town.persist(); } };
    // a battle you lead: the enemy's game shows you their settlement
    n.h = m => { if (this.awaitBattle && m.m && m.m.t === "snap") this.startBattle(m.m); };
    n.g = m => { if (this.bhost && m.from === this.bhost.to) this.bhost.fromGuest(m.m || {}); };
    n.pl = m => { if (this.bhost && m.pid === this.bhost.to) this.bhost.end("gone"); };
  }
  // (in Classic the others' bodies are in their own worlds, not yours)
  addRemote() {}
  friendly() { return true; }
  get S() { return G.town && G.town.S; }
  hud(on) {
    super.hud(on);
    document.body.classList.toggle("mp-nations", on);
    if (on) $("mpMode").textContent = "Classic · a nation each";
  }
  key(e) {
    if (super.key(e)) return true;
    if (e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return false;
    if (e.code === "KeyN" && !e.repeat && (G.mode === "play" || this.open)) { e.preventDefault(); this.toggle(); return true; }
    if (e.code === "Escape" && this.open) { this.toggle(false); return true; }
    return false;
  }
  // ---- how this nation stands, told to the others now and then ----
  status(now) {
    const S = this.S; if (!S) return;
    const t = G.town;
    const m = { t: "nat", nation: S.name || `${this.me.name}'s settlement`, pop: S.people.length + 2, day: t.day, coin: S.coin | 0, watch: S.people.filter(p => p.job === "watch" && !p.child).length,
      built: S.buildings.filter(b => b.done).length, known: S.tech ? S.tech.done.length : 0 };
    const k = JSON.stringify(m); if (!now && k === this.lastNat) return;
    this.lastNat = k; this.net.send(m);
  }
  tick(dt) {
    if (G.mp !== this) return;
    if ((this.natT = (this.natT || 0) - dt) <= 0) { this.natT = 4; this.status(); }
    if ((this.drawT = (this.drawT || 0) - dt) <= 0) { this.drawT = 1; this.drawWar(); if (this.open) this.drawNations(true); }
    // (a war party come against you while another fight was on: up the road as soon as that's over)
    if (this.queued && !(G.town && G.town.raids && G.town.raids.active)) { const q = this.queued; this.queued = null; this.raided(q); }
    if (this.bhost) this.bhost.tick(dt);
    if (this.awaitBattle && Date.now() > this.awaitBattle.until) { this.awaitBattle = null; UI.fade(0, 0.8); UI.hint("You couldn't get through to them. Your war party has gone on without you.", 5); }
  }
  // ---- goods: this game's own stores ----
  has(goods) { const S = this.S; if (!S || this.away) return false; return Object.entries(goods).every(([k, v]) => (S[k] || 0) >= v); }
  take(goods) { const S = this.S; for (const [k, v] of Object.entries(goods)) S[k] = (S[k] || 0) - v; this.stored(); }
  give(goods) {
    const S = this.S, t = G.town; let lost = 0;
    for (const [k, v] of Object.entries(goods || {})) {
      if (!NATION_GOODS[k] || !(v > 0)) continue;
      if (k === "store" && t.storeCap) { const room = Math.max(0, t.storeCap - (S.store || 0)); lost += Math.max(0, v - room); S.store = (S.store || 0) + Math.min(v, room); }
      else S[k] = (S[k] || 0) + v;
    }
    this.stored();
    return lost;
  }
  stored() { const t = G.town; if (!t) return; t.showStore && t.showStore(); t.persist(); }
  settleOld() {
    const S = this.S; if (!S) return;
    const held = S.natHeld || {};
    for (const g of Object.values(held)) this.give(g);
    S.natHeld = {};
    if (S.warband) this.warbandHome({ id: S.warband.id, n: S.warband.people.length, down: 0, loot: {}, name: S.warband.toName, stale: true });
  }
  // (while you're away at a battle, your own settlement isn't loaded: what comes for it waits until you're home)
  get away() { return !!(this.battle || this.reloading); }
  got(m) {
    if (this.away) return this.later.push(() => this.got(m));
    const S = this.S; if (!S) return;
    if (m.id && S.natHeld && S.natHeld[m.id]) {
      // (an offer of ours: taken — the goods set aside are gone to them; or turned down — they come back)
      delete S.natHeld[m.id];
    }
    const lost = this.give(m.goods);
    G.tell && G.tell("trade", null, `${m.why || "A trade."}${Object.keys(m.goods || {}).length ? ` In: ${list(m.goods)}.` : ""}${lost ? ` (${lost} logs had no room in the woodshed.)` : ""}`, 5);
    this.offers.delete(m.id); this.redraw();
  }
  // ---- war parties ----
  // who can go: grown people, well, and not already away (the watch first, then whoever)
  fighters() {
    const S = this.S; if (!S) return [];
    return S.people.filter(p => !p.child && !(p.sick > 0)).sort((a, b) => (b.job === "watch") - (a.job === "watch"));
  }
  sendWarband(to, n, lead) {
    const S = this.S, t = G.town, w = this.warWith(to); if (!S || !w || S.warband) return;
    const go = this.fighters().slice(0, n); if (!go.length) return UI.hint("There's no one fit to send.", 3);
    const r0 = t.w.road[t.w.road.length - 30];
    for (const p of go) {
      S.people.splice(S.people.indexOf(p), 1);
      const a = t.actors.find(x => x.settler === p);
      if (a) { a.gone = true; if (a.talkIt) t.w.removeInteract(a.talkIt); a.walkTo(r0.x, r0.z, 1.6).then(() => { a.remove(); const i = t.actors.indexOf(a); if (i >= 0) t.actors.splice(i, 1); }); }
    }
    const toName = this.natName(to);
    S.warband = { id: null, to, toName, people: go, at: Date.now() };
    t.persist();
    this.net.send({ t: "raid", to, n: go.length, people: go.map(p => p.name), lead: !!lead });
    G.tell && G.tell("big", null, `${go.length} of your people take up arms and go down the road against ${toName}: ${go.map(p => p.name).join(", ")}.${lead ? " You go at their head." : ""}`, 6);
    this.toggle(false);
    // leading them: down the road with them, and up theirs (the enemy's game shows you the battle)
    if (lead) { this.awaitBattle = { to, until: Date.now() + 15000 }; UI.fade(1, 1.2); UI.hint(`You march with them, down the road to ${toName}…`, 4); }
  }
  warbandHome(m) {
    if (this.away) return this.later.push(() => this.warbandHome(m));
    const S = this.S, t = G.town; if (!S || !S.warband) return;
    const band = S.warband.people, down = Math.min(band.length, m.down | 0);
    S.warband = null;
    const dead = band.slice(0, down), back = band.slice(down);
    const r0 = t.w.road[t.w.road.length - 30];
    back.forEach((p, i) => t.addPerson(p, r0.x + (i % 3 - 1) * 1.2, r0.z + Math.floor(i / 3) * 1.4));
    for (const p of dead) { p.diedOf = null; t.killSettler(p, "war"); }
    const lost = this.give(m.loot);
    const got = Object.values(m.loot || {}).some(v => v > 0);
    const text = m.stale ? `The war party you sent against ${m.name} has come home — the war ended without them.`
      : m.gone ? `${m.name} is gone from the world; your war party found nothing to fight and has come home.`
      : !back.length ? `None of the ${band.length} you sent against ${m.name} came back.`
      : `Your war party is back from ${m.name}${down ? `, ${down} fewer than went` : ", every one of them"}${got ? `, with ${list(m.loot)}` : ", empty-handed"}.${lost ? ` (${lost} logs had no room in the woodshed.)` : ""}`;
    G.tell && G.tell("big", null, text, 7);
    t.persist();
  }
  // a war party against us: up our road, a raid like any other, and told back how it went
  raided(m) {
    if (this.away) return this.later.push(() => this.raided(m));
    const t = G.town, R = t && t.raids;
    if (!R) return this.net.send({ t: "raidEnd", id: m.id, down: 0, loot: {} });
    if (R.active) { this.queued = m; this.toast(`${m.name} has sent ${m.n} armed men against you. They'll be up the road as soon as this fight is done.`); return; }
    R.start({ n: m.n, nation: { name: m.name, over: res => this.net.send({ t: "raidEnd", id: m.id, down: res.down, loot: res.loot }) } });
    // led by their ruler in person: they're here, in the band, and see all of it
    if (m.lead) { this.bhost = new BattleHost(this, m); UI.bark(G.who === "sister" ? "Brother" : "Sister", `That's ${m.ruler} at their head — ${m.name}'s own ruler!`, 4); }
  }
  // ---- relations ----
  natName(pid) { const n = this.nats[pid]; return n ? n.nation : "someone"; }
  allied(pid) { return this.pacts.has([this.pid, pid].sort().join("|")); }
  warWith(pid) { return this.nwars.find(w => (w.a === this.pid && w.b === pid) || (w.b === this.pid && w.a === pid)) || null; }
  toast(text) {
    const el = $("mpToast"); el.textContent = text; el.classList.remove("hidden");
    clearTimeout(this._toast); this._toast = setTimeout(() => el.classList.add("hidden"), 6000);
    this.chatLine({ name: "", text });
  }
  ticker(n) {
    const el = $("mpTicker");
    el.innerHTML = `<b>${NEWS_K[n.kind] || "News"}</b>${esc(n.text)}`; el.classList.remove("hidden");
    clearTimeout(this._tick); this._tick = setTimeout(() => el.classList.add("hidden"), 7000);
  }
  // at war: who with, and whether a war party is out
  drawWar() {
    const el = $("mpWar"), mine = this.nwars.filter(w => w.a === this.pid || w.b === this.pid);
    if (!mine.length) { el.classList.add("hidden"); return; }
    const S = this.S, out = S && S.warband;
    el.classList.remove("hidden");
    el.innerHTML = `<div class="wt">At war</div>${mine.map(w => esc(this.nats[w.a === this.pid ? w.b : w.a] ? this.natName(w.a === this.pid ? w.b : w.a) : w.a === this.pid ? w.bName : w.aName)).join(", ")}<div class="ws">${out ? `${out.people.length} of yours are out against ${esc(out.toName)}` : "N to send a war party, or sue for peace"}</div>`;
  }
  // ---- the nations screen ----
  panel() {
    if ($("mpNations")) return;
    const d = document.createElement("div"); d.id = "mpNations"; d.className = "hidden";
    d.innerHTML = `<div class="mc-win"><div class="mc-label">The nations <span class="mc-hint">N to close</span></div><div id="mpNatBody"></div></div>`;
    document.body.appendChild(d);
    // (typing a number in here is a number, not a tool from the belt)
    d.addEventListener("keydown", e => { if (/^(INPUT|SELECT)$/.test(e.target.tagName)) { e.stopPropagation(); if (e.key === "Escape") this.toggle(false); } });
    d.addEventListener("click", e => this.click(e));
  }
  toggle(on = !this.open) {
    this.open = on; this.form = on ? this.form : null;
    $("mpNations").classList.toggle("hidden", !on);
    if (on) { G.releaseMouse && G.releaseMouse(); this.drawNations(); } else G.lockMouse && G.lockMouse();
  }
  redraw() { if (this.open) this.drawNations(); this.drawWar(); }
  drawNations(soft) {
    // (while you're filling something in, the screen isn't drawn over it)
    if (soft && this.form) return;
    const S = this.S, mine = this.nats[this.pid];
    const others = Object.values(this.nats).filter(n => n.pid !== this.pid);
    const row = n => {
      const war = this.warWith(n.pid), ally = this.allied(n.pid);
      const rel = war ? `<span class="nt-rel war">At war</span>` : ally ? `<span class="nt-rel ally">Allies</span>` : `<span class="nt-rel">At peace</span>`;
      const acts = [`<button data-a="trade" data-p="${n.pid}">Trade</button>`];
      if (war) { acts.push(`<button data-a="peace" data-p="${n.pid}">Sue for peace</button>`); if (!(S && S.warband)) acts.push(`<button data-a="band" data-p="${n.pid}" class="red">Send a war party</button>`); }
      else if (ally) acts.push(`<button data-a="unpact" data-p="${n.pid}">Break the alliance</button>`);
      else acts.push(`<button data-a="pact" data-p="${n.pid}">Offer an alliance</button>`, `<button data-a="war" data-p="${n.pid}" class="red">Declare war</button>`);
      return `<div class="nt-row${war ? " war" : ally ? " ally" : ""}"><div><div class="nt-n">${esc(n.nation)} ${rel}</div><div class="nt-s">${esc(n.ruler)} · ${n.pop} souls · day ${n.day + 1} · ${n.built} buildings · ${n.known} known · ${n.watch} on the watch · ${n.coin} DM</div></div><div class="nt-a">${acts.join("")}</div></div>`
        + (this.form && this.form.pid === n.pid ? this.formHtml(n) : "");
    };
    const waiting = [];
    for (const a of this.asks) waiting.push(`<div class="nt-ask">${a.kind === "pact" ? `<b>${esc(a.name)}</b> offers you an alliance.` : `<b>${esc(a.name)}</b> sues for peace.`} <button data-a="${a.kind}ok" data-p="${a.from}">Accept</button><button data-a="${a.kind}no" data-p="${a.from}">Refuse</button></div>`);
    for (const o of this.offers.values()) {
      if (o.to === this.pid) waiting.push(`<div class="nt-ask"><b>${esc(o.fromName)}</b> ${Object.keys(o.want).length ? `offers ${esc(list(o.give))} for ${esc(list(o.want))}.` : `sends a gift: ${esc(list(o.give))}.`} <button data-a="accept" data-o="${o.id}"${this.has(o.want) ? "" : " disabled title=\"You haven't enough\""}>${Object.keys(o.want).length ? "Accept" : "Take it"}</button><button data-a="decline" data-o="${o.id}">Refuse</button></div>`);
      else if (o.from === this.pid) waiting.push(`<div class="nt-ask mine">You offered <b>${esc(o.toName)}</b> ${esc(list(o.give))}${Object.keys(o.want).length ? ` for ${esc(list(o.want))}` : " as a gift"}. Waiting on them. <button data-a="cancel" data-o="${o.id}">Take it back</button></div>`);
    }
    const news = this.news.slice(-8).reverse().map(n => `<div class="nw"><span class="k">${NEWS_K[n.kind] || "News"}</span>${esc(n.text)}<span class="w">${ago(n.at)}</span></div>`).join("");
    $("mpNatBody").innerHTML = `<div class="nt-me">${esc(mine ? mine.nation : S ? S.name : "Your nation")} <span>— yours. ${S && S.warband ? `${S.warband.people.length} of your people are away at war.` : "Everything in it is played as in free play."}</span></div>`
      + (waiting.length ? `<div class="nt-sec">Waiting on you</div>${waiting.join("")}` : "")
      + `<div class="nt-sec">The other nations</div>` + (others.length ? others.map(row).join("") : `<p class="mc-hint">No one else is here yet. Others join from the Multiplayer list, each with a nation of their own.</p>`)
      + `<div class="nt-sec">The news</div>${news || `<p class="mc-hint">Nothing yet that anyone's talking about.</p>`}`;
  }
  formHtml(n) {
    const S = this.S, f = this.form;
    if (f.kind === "band") {
      const max = Math.min(10, this.fighters().length);
      return `<div class="nt-form"><div>Send a war party against <b>${esc(n.nation)}</b>: your people walk down the road, and come up theirs. Those who fall don't come back; the rest bring home what they carry off.</div>
        <label><input type="checkbox" id="ntBandLead" checked style="width:auto"> Lead them yourself — go with them, and fight at their head in ${esc(n.nation)}'s own settlement. If you fall, they carry you home.</label>
        <label>How many <input type="number" id="ntBandN" min="1" max="${max}" value="${Math.min(max, Math.max(1, Math.ceil(max / 3)))}"> of ${max} fit to fight${S.people.filter(p => p.job === "watch").length ? " (the watch go first)" : ""}</label>
        <div class="nt-fa"><button data-a="bandgo" data-p="${n.pid}" class="red"${max ? "" : " disabled"}>Send them</button><button data-a="close">Not now</button></div></div>`;
    }
    const inp = (side, k) => `<label>${NATION_GOODS[k]} <input type="number" min="0" data-side="${side}" data-k="${k}" value="0"></label>`;
    return `<div class="nt-form"><div>A trade with <b>${esc(n.nation)}</b>: what you give is set aside until they answer. Ask for nothing and it's a gift.</div>
      <div class="nt-cols"><div><div class="nt-h">You give <span class="mc-hint">(you have)</span></div>${GOODS.map(k => inp("give", k).replace("</label>", ` <i>${S[k] | 0}</i></label>`)).join("")}</div><div><div class="nt-h">You ask for</div>${GOODS.map(k => inp("want", k)).join("")}</div></div>
      <div class="nt-fa"><button data-a="offergo" data-p="${n.pid}">Make the offer</button><button data-a="close">Not now</button></div></div>`;
  }
  click(e) {
    const b = e.target.closest("button[data-a]"); if (!b) return;
    const a = b.dataset.a, pid = b.dataset.p, oid = b.dataset.o, send = m => this.net.send(m);
    const dropAsk = kind => { this.asks = this.asks.filter(x => !(x.kind === kind && x.from === pid)); };
    switch (a) {
      case "trade": this.form = { kind: "trade", pid }; break;
      case "band": this.form = { kind: "band", pid }; break;
      case "close": this.form = null; break;
      case "pact": case "unpact": case "war": case "peace": send({ t: a, to: pid }); break;
      case "pactok": case "pactno": dropAsk("pact"); send({ t: a, to: pid }); break;
      case "peaceok": case "peaceno": dropAsk("peace"); send({ t: a, to: pid }); break;
      case "offergo": {
        const give = {}, want = {};
        for (const i of document.querySelectorAll("#mpNations .nt-form input[data-side]")) { const v = Math.max(0, Math.floor(+i.value || 0)); if (v) (i.dataset.side === "give" ? give : want)[i.dataset.k] = v; }
        if (!Object.keys(give).length && !Object.keys(want).length) return UI.hint("Put something in the offer.", 2);
        if (!this.has(give)) return UI.hint("You haven't that much to give.", 3);
        this.take(give);
        // (set aside: held in the save, so it comes back if the game ends before they answer)
        const S = this.S; S.natHeld ??= {};
        const tmp = "pending" + Date.now(); S.natHeld[tmp] = give; G.town.persist();
        const once = this.net.on.offer;
        this.net.on.offer = m => { if (m.o.from === this.pid && S.natHeld[tmp]) { S.natHeld[m.o.id] = S.natHeld[tmp]; delete S.natHeld[tmp]; G.town.persist(); } this.net.on.offer = once; once(m); };
        send({ t: "offer", to: pid, give, want });
        this.form = null; break;
      }
      case "bandgo": { const n = Math.max(1, Math.floor(+($("ntBandN") || {}).value || 1)), lead = !!($("ntBandLead") || {}).checked; this.form = null; this.sendWarband(pid, n, lead); return; }
      case "accept": {
        const o = this.offers.get(oid); if (!o) break;
        if (!this.has(o.want)) return UI.hint("You haven't enough for that.", 3);
        this.take(o.want);
        send({ t: "accept", id: oid, paid: o.want });
        this.offers.delete(oid); break;
      }
      case "decline": case "cancel": send({ t: a, id: oid }); this.offers.delete(oid); break;
    }
    this.drawNations();
  }
  // ---- a battle led in person ----
  startBattle(snap) {
    const to = this.awaitBattle.to; this.awaitBattle = null;
    // (your own settlement saved and put away until you're back)
    try { G.flushSave && G.flushSave(); } catch (e) {}
    this.toggle(false);
    const i = G.onFrame.indexOf(this.tickFn); if (i >= 0) G.onFrame.splice(i, 1);
    this.battle = new Battle(this, to, snap);
  }
  // back from it: your own settlement loaded again, and the news that waited for you
  home(why) {
    this.battle = null; this.reloading = true;
    G.mp = this;
    this.listen();
    this.hooks.home(() => {
      this.reloading = false;
      G.mp = this;
      if (!G.onFrame.includes(this.tickFn)) G.onFrame.push(this.tickFn);
      this.hud(true);
      if (why === "down") { G.health = 0.35; UI.hint("You were cut down at the head of your men. They carried you home — alive, just.", 6); }
      else if (why === "spent") UI.hint("Your war party is spent, and you fell back with it. You're home.", 5);
      else if (why === "withdraw") UI.hint("You fell back down the road, and you're home.", 4);
      else if (why === "gone") UI.hint("They're gone from the world — the battle's over. You're home.", 5);
      const l = this.later; this.later = [];
      for (const f of l) { try { f(); } catch (e) { console.warn("nations: after a battle", e); } }
      this.status(true);
    });
  }
  leave(quiet) {
    if (this.battle) { this.battle.quit(); this.battle = null; }
    if (this.bhost) this.bhost.end("gone");
    if (G.mp !== this) return;
    const i = G.onFrame.indexOf(this.tickFn); if (i >= 0) G.onFrame.splice(i, 1);
    // (what was set aside, and anyone away at war, are home: the game is leaving the others)
    this.settleOld();
    this.toggle(false);
    $("mpWar").classList.add("hidden"); $("mpTicker").classList.add("hidden");
    document.body.classList.remove("mp-nations");
    this.leaveCommon(quiet);
    G.mp = null;
  }
}

// (the settlement as a save keeps it, the game's own bookkeeping left out)
const plain = v => JSON.parse(JSON.stringify(v, (k, x) => (k[0] === "_" ? undefined : x)));

// ---------------------------------------------------------------------------
//  the defender's game, with a ruler come against it in person: they're one of the war party here (a raider moved
//  from their game), and their game is shown this settlement, its people and the fight, as it happens
// ---------------------------------------------------------------------------
class BattleHost {
  constructor(nat, m) {
    this.nat = nat; this.to = m.from; this.id = m.id;
    this.ids = new WeakMap(); this.nextId = 1; this.sent = new Map(); this.last = {}; this.spent = 0;
    const R = this.R = G.town.raids, e = R.roadEnd;
    this.at = { x: e.x, z: e.z + 2.5 };
    this.r = R.addPuppet(lookOpts(m.look || {}, m.ruler), this.at.x, this.at.z);
    this.r.puppet.onDown = () => this.end("down");
    // (their name over them, red: an enemy)
    try { this.tag = nameTag(m.ruler, "#e07060"); this.tag.position.y = 2.15; this.r.a.root.add(this.tag); } catch (e) {}
    this.hostOpts = lookOpts(nat.me.look || {}, nat.me.name);
    this.snapshot();
  }
  send(m) { this.nat.net.send({ t: "bh", to: this.to, m }); }
  idOf(a) { let id = this.ids.get(a); if (!id) { id = "a" + this.nextId++; this.ids.set(a, id); } return id; }
  actors() { return (G.world ? G.world.actors : []).filter(a => !a.remote && a.opts && a.root && !a.isPuppet); }
  defs(all) {
    const out = [];
    if (all || !this.sent.has("host")) { out.push({ id: "host", opts: this.hostOpts }); this.sent.set("host", G.player); }
    for (const a of this.actors()) { const id = this.idOf(a); if (all || !this.sent.has(id)) { out.push({ id, opts: plain(a.opts) }); this.sent.set(id, a); } }
    return out;
  }
  snapshot() {
    const t = G.town;
    this.send({ t: "snap", S: plain(t.S), clock: t.t, actors: this.defs(true), at: this.at });
  }
  fromGuest(m) {
    const r = this.r; if (!r || this.done) return;
    if (m.t === "hello") return this.snapshot();
    if (m.t === "pos") { const P = r.puppet; P.tx = +m.x || P.tx; P.tz = +m.z || P.tz; P.tyaw = (+m.yaw || 0) + Math.PI; P.spd = Math.min(8, +m.s || 0); return; }
    if (m.t === "act" && m.a === "swing") return this.R.puppetSwing(r, m.dir);
    if (m.t === "act" && m.a === "withdraw") return this.end("withdraw");
  }
  tick(dt) {
    if (this.done) return;
    const t = G.town; if (!t) return;
    if ((this.axT = (this.axT || 0) - dt) <= 0) {
      this.axT = 0.1;
      const neu = this.defs(false); if (neu.length) this.send({ t: "ad", l: neu });
      const live = new Set(["host"]), pl = G.player, w = G.world;
      const l = [["host", +pl.pos.x.toFixed(2), +w.heightAt(pl.pos.x, pl.pos.z).toFixed(2), +pl.pos.z.toFixed(2), +(pl.yaw + Math.PI).toFixed(2), pl.swingT >= 0 ? "chop" : "idle", +(pl.speed || 0).toFixed(2), G.downed ? 1 : 0, 1, 0]];
      for (const a of this.actors()) {
        const id = this.idOf(a); live.add(id);
        l.push([id, +a.pos.x.toFixed(2), +a.root.position.y.toFixed(2), +a.pos.z.toFixed(2), +a.yaw.toFixed(2), a.person.pose || "idle", +(a.speed || 0).toFixed(2), a.lieK != null ? +(+a.lieK).toFixed(2) : a.lying ? 1 : 0, a.root.visible ? 1 : 0, a.person.sitting ? +a.person.sitting.toFixed(2) : 0]);
      }
      const gone = [...this.sent.keys()].filter(id => !live.has(id));
      for (const id of gone) this.sent.delete(id);
      if (gone.length) this.send({ t: "ar", l: gone });
      this.send({ t: "ax", l });
      // how they stand: their wounds, as this game has them
      const hp = Math.max(0, Math.round(this.r.hp));
      if (hp !== this.lastHp) { this.lastHp = hp; this.send({ t: "bhp", hp, max: this.r.maxHp }); }
    }
    if ((this.sdT = (this.sdT || 0) - dt) <= 0) {
      this.sdT = 1;
      const S = t.S, d = {};
      for (const k of Object.keys(S)) {
        if (k[0] === "_") continue;
        let j; try { j = JSON.stringify(S[k], (kk, x) => (kk[0] === "_" ? undefined : x)); } catch (e) { continue; }
        if (this.last[k] !== j) { this.last[k] = j; d[k] = j === undefined ? null : JSON.parse(j); }
      }
      this.send({ t: "sd", d, clock: t.t });
    }
    // their men all down or gone: the one leading them falls back too, a few moments after
    const others = this.R.band.some(x => x !== this.r && x.alive && !x.puppet) || this.R.pending;
    this.spent = others ? 0 : this.spent + dt;
    if (this.spent > 6) this.end("spent");
  }
  end(why) {
    if (this.done) return; this.done = true;
    try { this.send({ t: "bend", why }); } catch (e) {}
    const r = this.r, R = this.R;
    if (why !== "down" && r && r.alive) { r.state = "gone"; R.lock(r, null); r.a.remove(); R.forget(r); }
    if (this.nat.bhost === this) this.nat.bhost = null;
    if (why === "down") UI.hint("Their ruler is down! The rest of them will break now.", 4);
    else if (why === "withdraw") UI.hint("Their ruler has fallen back down the road.", 4);
  }
}

// ---------------------------------------------------------------------------
//  the attacker's game, at the head of the war party: the enemy's settlement, as their game has it, and the fight in it.
//  What you do is done there: where you go, and every blow (struck as theirs strike, drawn back first).
// ---------------------------------------------------------------------------
class Battle extends ColonyGuest {
  constructor(nat, foe, snap) {
    super(nat.net, { room: nat.room, you: { pid: nat.pid }, players: [], online: [], chat: [] }, nat.me, {});
    this.nat = nat; this.foe = foe; this.foeName = nat.natName(foe);
    const n = this.net.on;
    n.lost = () => { this.quit(); nat.hooks.lost && nat.hooks.lost("The connection to the server was lost. Your nation is saved; host or join again to carry on."); };
    n.ended = n.lost;
    // (a battle is no one's colony: no colony achievements, and its own words)
    const ach = G.achEvent; G.achEvent = () => {};
    try { this.fromHost(snap); } finally { G.achEvent = ach; }
    this.chatLines.pop(); this.drawChat();
    AUDIO.music && AUDIO.music("battle");
    G.showHealth = true; G.health = 1;
    UI.hint(`${this.foeName}. Your men are on the road with you — cut down their defenders, and get out alive. N to fall back.`, 7);
  }
  send(a, more) { this.net.send({ t: "bg", to: this.foe, m: { t: "act", a, at: this.at(), ...more } }); }
  wire(town) {
    G.onSwing = () => { this.send("swing", { dir: G.player.swingDir || "right" }); };
    G.mpUse = () => { UI.hint("Not here — you're at war. Fight, or N to fall back.", 2.5); return true; };
    town.remoteAct = () => {};
    town.persist = () => {};
    for (const fn of ["research", "recruit", "train", "upgrade", "upgradeHome", "repair", "makePeace", "leave", "enlargeRoom", "enlarge", "dismantle", "claim", "chooseJob", "stableIt"]) town[fn] = () => null;
    town.furnish = () => {};
  }
  fromHost(m) {
    if (m.t === "bhp") {
      const k = Math.max(0, Math.min(1, m.hp / (m.max || 160)));
      if (k < (this.hpK ?? 1) - 0.01) { G.hurtT = 0; G.hitShake = 0.25; }
      this.hpK = k; G.health = Math.max(0.02, k); return;
    }
    if (m.t === "bend") return this.finish(m.why);
    if (m.t === "say" || m.t === "news" || m.t === "tell") return;
    return super.fromHost(m);
  }
  key(e) {
    if (super.key(e)) return true;
    if (e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return false;
    if (e.code === "KeyN" && !e.repeat && G.mode === "play") {
      if (this.armed && performance.now() - this.armed < 3000) { this.send("withdraw"); this.armed = 0; }
      else { this.armed = performance.now(); UI.hint("Fall back down the road? N again to go.", 3); }
      return true;
    }
    return false;
  }
  tick(dt) {
    if (G.mp !== this || !this.ready) return;
    G.showHealth = true;
    if ((this.posT = (this.posT || 0) - dt) <= 0) {
      this.posT = 0.1; const pl = G.player;
      this.net.send({ t: "bg", to: this.foe, m: { t: "pos", x: +pl.pos.x.toFixed(2), z: +pl.pos.z.toFixed(2), yaw: +pl.yaw.toFixed(3), s: +(pl.speed || 0).toFixed(2) } });
    }
    const el = $("mpWar"); el.classList.remove("hidden");
    el.innerHTML = `<div class="wt">Battle</div>${esc(this.foeName)}<div class="ws">You lead the attack · N to fall back</div>`;
  }
  // over: dark, and home
  finish(why) {
    if (this.over) return; this.over = true;
    G.lockMove = true; UI.fade(1, 0.9);
    if (why === "down") UI.hint("You're down — the world goes dark…", 3);
    setTimeout(() => { this.quit(); G.lockMove = false; this.nat.home(why); }, 1600);
  }
  // put away, without letting go of the server (the nation goes on)
  quit() {
    if (this.gone) return; this.gone = true;
    const i = G.onFrame.indexOf(this.tickFn); if (i >= 0) G.onFrame.splice(i, 1);
    for (const x of this.mirrors.values()) x.remove();
    this.mirrors.clear();
    this.closeChat();
    $("mpWar").classList.add("hidden");
    if (G.town) { G.town.stop && G.town.stop(); G.town = null; }
    G.mpUse = null; G.onSwing = null;
    if (G.mp === this) G.mp = this.nat;
  }
}
