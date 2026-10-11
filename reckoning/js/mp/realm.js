// ===========================================================================
//  FORESTER: RECKONING — Copyright (c) 2026 Roan Fraese / DeadlyDog Productions
// ===========================================================================

// THE REALM, in Frontier: raise a town hall and you're crowned its king or queen. G opens the government — the same
// window as the settlement's in the story — with the nation (its name, its crown, its ground and its store), its
// people (governors and citizens: made, unmade, sent away), and the people here who might be asked to join it, as a
// citizen or as a governor. A citizen builds on the nation's ground and keeps its store; a governor can invite
// citizens, rebuild the hall and set the settlers to work; the crown does all of that and names the governors.

import { G } from "../engine.js";
import { UI, $ } from "../ui.js";
import { HALL, claimOf } from "./rules.js";

const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const ROLE = { monarch: "The crown", governor: "Governor", citizen: "Citizen" };
const TITLES = ["King", "Queen", "Prince", "Princess", "Duke", "Duchess", "Lord", "Lady", "Elector", "Margrave"];
let storyTabs = null, tab = "nation";

// what the game asks of the realm (mixed into the Frontier game)
export const Realm = {
  natOf(pid) { const N = this.nations || {}; if (N[pid]) return pid; for (const [k, n] of Object.entries(N)) if (n.members && n.members[pid]) return k; return null; },
  roleOf(pid) { const n = this.natOf(pid); return n ? this.nations[n].members[pid] : null; },
  sameNation(a, b) { const n = this.natOf(a); return !!n && n === this.natOf(b); },
  myNation() { const n = this.natOf(this.pid); return n ? { id: n, ...this.nations[n] } : null; },
  nameOfPid(pid) { if (pid === this.pid) return this.me.name; const r = this.remotes.get(pid); return r ? r.name : null; },

  // the server's word on the nations
  onNations(m) {
    const was = this.roleOf(this.pid);
    this.nations = m.nations || {};
    const now = this.roleOf(this.pid);
    // (buildings that have changed sides — your new nation's, or one you've left — put up again with what can be done
    //  at them now: the store at its hall, its fire, its stable)
    for (const e of [...this.w.blds.values()]) if (!!e.friendly !== !!this.friendly(e.b.owner)) { const b = e.b; this.removeBNow(b.id); this.addB(b); }
    if (was !== now && now && now !== "monarch") { const n = this.myNation(); UI.news({ img: "event_peace", title: now === "governor" ? `A governor of ${n.name}` : `A citizen of ${n.name}`, sub: now === "governor" ? "You can invite citizens, rebuild the hall and set the settlers to work. G: the government." : "Build on its ground, and keep its store. G: the government." }); }
    this.refreshFriends && this.refreshFriends();
    if (this.govOpen) this.drawGov();
    if (this.listOpen) this.drawList();
  },
  onCrowned(m) {
    UI.news({ img: "event_conquest", title: `Crowned ${m.title}`, sub: `The town hall stands, and the land round it is yours: you are ${m.title} of ${m.name}. Press G to govern — name your realm, and ask others to join it.` });
    G.achEvent && G.achEvent("mp-crown");
  },
  // asked to join a nation: Y or N, as an alliance is asked
  onNatAsk(m) {
    const e = $("mpInvite");
    e.innerHTML = `<b>${esc(m.from)}</b> asks you to join <b>${esc(m.name)}</b>${m.monarch ? ` (${esc(m.title)} ${esc(m.monarch)})` : ""} as ${m.role === "governor" ? "a <b>governor</b>" : "a <b>citizen</b>"}. <span class="k">Y</span> yes · <span class="k">N</span> no`;
    e.classList.remove("hidden"); this.natInvite = m;
    clearTimeout(this._invT); this._invT = setTimeout(() => { e.classList.add("hidden"); this.natInvite = null; }, 30000);
  },
  answerNat(yes) { const m = this.natInvite; if (!m) return; this.net.send({ t: yes ? "natyes" : "natno", nation: m.nation }); $("mpInvite").classList.add("hidden"); this.natInvite = null; },

  // ---- the government (G) ----
  toggleGov(on = !this.govOpen) {
    const el = $("gov"), tabs = $("govTabs");
    this.govOpen = on;
    if (on) {
      if (storyTabs == null) storyTabs = tabs.innerHTML;
      tabs.innerHTML = ["nation", "people", "invite", "realms"].map(k => `<button class="gov-tab" data-tab="${k}">${{ nation: "Nation", people: "People", invite: "Invite", realms: "Realms" }[k]}</button>`).join("");
      for (const b of tabs.querySelectorAll(".gov-tab")) b.onclick = () => { tab = b.dataset.tab; this.drawGov(); };
      el.classList.remove("hidden"); G.releaseMouse && G.releaseMouse(); window.__uisfx && window.__uisfx.open();
      this.drawGov();
    } else {
      el.classList.add("hidden"); if (storyTabs != null) { tabs.innerHTML = storyTabs; storyTabs = null; }
      G.lockMouse && G.lockMouse(); window.__uisfx && window.__uisfx.close();
    }
  },
  drawGov() {
    const n = this.myNation(), role = this.roleOf(this.pid), crown = role === "monarch";
    $("govTitle").textContent = n ? `${n.title ? n.title + " " + ((this.nations[n.id] && this.nameOfPid(n.id)) || "") : ""} · ${n.name}`.replace(/^ · /, "") : "Government";
    for (const b of document.querySelectorAll("#govTabs .gov-tab")) b.classList.toggle("on", b.dataset.tab === tab);
    const body = $("govBody");
    if (!n && tab !== "realms") {
      body.innerHTML = `<div class="gov-head"><div class="gov-name">No nation</div><span class="gov-rank">Free</span></div>
        <p class="gov-why">You owe allegiance to no one. <b>Raise a town hall</b> (<kbd>B</kbd>) and you'll be crowned — king or queen of the ground round it — with a government of your own to run, and people to ask into it.</p>
        <p class="gov-why">Or join someone else's: a crown or one of its governors can ask you in, as a citizen or a governor.</p>`;
      return;
    }
    if (tab === "nation") {
      const hall = this.natHall(n.id), lv = hall ? (hall.b.level || 1) : 0, people = Object.keys(n.members).length;
      const settlers = [...(this.settlers ? this.settlers.values() : [])].filter(v => v.owner === n.id || this.sameNation(v.owner, this.pid)).length;
      let blds = 0; for (const e of this.w.blds.values()) if (e.b.owner === n.id || this.sameNation(e.b.owner, n.id)) blds++;
      const stat = (k, v, note) => `<div class="gov-stat"><div class="k">${k}</div><div class="v">${v}</div>${note ? `<div class="n">${note}</div>` : ""}</div>`;
      body.innerHTML = `<div class="gov-head"><div class="gov-name">${esc(n.name)}</div><span class="gov-rank">${esc(n.title)} · ${esc(this.nameOfPid(n.id) || "away")}</span><span class="gov-sub">founded on day ${n.founded || 1}</span></div>
        <p class="gov-why">You are ${role === "monarch" ? `its <b>${esc(n.title)}</b>` : role === "governor" ? "one of its <b>governors</b>" : "one of its <b>citizens</b>"}. ${role === "monarch" ? "Everything here is yours to order." : role === "governor" ? "You can invite citizens, rebuild the hall and set the settlers to work." : "Build on the nation's ground, and keep its store."}</p>
        <div class="gov-grid">
          ${stat("People", people, `${Object.values(n.members).filter(r => r === "governor").length} governor${Object.values(n.members).filter(r => r === "governor").length === 1 ? "" : "s"}`)}
          ${stat("Settlers", settlers, "living in its houses")}
          ${stat("Town hall", hall ? (HALL[lv] ? HALL[lv].name : "Town hall") : "None", hall ? `claims ${Math.round(claimOf(hall.b))} m round it` : "raise one again to hold ground")}
          ${stat("Buildings", blds)}
          ${stat("The store", `${this.stock.wood | 0} logs`, `${this.stock.stone | 0} stone · ${this.stock.food | 0} food`)}
        </div>
        ${crown ? `<div class="gov-sec">The crown</div>
          <div class="realm-form"><label>Name <input id="rlName" maxlength="36" value="${esc(n.name)}" spellcheck="false"></label>
          <label>Title <select id="rlTitle">${TITLES.map(t => `<option${t === n.title ? " selected" : ""}>${t}</option>`).join("")}</select></label>
          <button class="btn" id="rlSave">Proclaim it</button></div>` : role ? `<div class="realm-form"><button class="btn" id="rlLeave">Leave ${esc(n.name)}</button></div>` : ""}`;
      if (crown) $("rlSave").onclick = () => { this.net.send({ t: "natname", name: $("rlName").value.trim(), title: $("rlTitle").value }); UI.hint("Proclaimed.", 2); };
      else if ($("rlLeave")) $("rlLeave").onclick = () => { if (confirm(`Leave ${n.name}? Its store and its ground stay with it.`)) this.net.send({ t: "natleave" }); };
    } else if (tab === "people") {
      const rows = Object.entries(n.members).sort((a, b) => ["monarch", "governor", "citizen"].indexOf(a[1]) - ["monarch", "governor", "citizen"].indexOf(b[1]));
      body.innerHTML = `<div class="gov-sec">The people of ${esc(n.name)}</div>` + rows.map(([pid, r]) => {
        const name = this.nameOfPid(pid), here = !!name || pid === this.pid;
        const acts = pid === this.pid || r === "monarch" ? "" : [
          crown ? `<button data-a="role" data-p="${pid}" data-r="${r === "governor" ? "citizen" : "governor"}">${r === "governor" ? "Make a citizen" : "Make a governor"}</button>` : "",
          (crown || (role === "governor" && r === "citizen")) ? `<button data-a="dismiss" data-p="${pid}">Send away</button>` : "",
        ].join("");
        return `<div class="mp-pl realm-row"><span class="n">${esc(name || "(away)")}${pid === this.pid ? " <i>you</i>" : ""}</span><span class="g">${ROLE[r]}${here ? "" : " · away"}</span><span class="a">${acts}</span></div>`;
      }).join("");
      for (const b of body.querySelectorAll("button[data-a]")) b.onclick = () => {
        if (b.dataset.a === "role") this.net.send({ t: "natrole", pid: b.dataset.p, role: b.dataset.r });
        else if (confirm("Send them away from the nation?")) this.net.send({ t: "natdismiss", pid: b.dataset.p });
      };
    } else if (tab === "invite") {
      const can = role === "monarch" || role === "governor";
      const others = [...this.remotes.values()].filter(r => !this.sameNation(r.pid, this.pid));
      body.innerHTML = `<div class="gov-sec">Ask people into ${esc(n.name)}</div>
        <p class="gov-why">${can ? (crown ? "Ask anyone here to join — as a <b>citizen</b>, to build on your ground and keep your store, or as a <b>governor</b>, to help you run it." : "As a governor you can ask people in as <b>citizens</b>; only the crown makes governors.") : "Only the crown and its governors can ask people in."}</p>` +
        (others.length ? others.map(r => { const theirs = this.natOf(r.pid), crowned = this.nations[r.pid]; return `<div class="mp-pl realm-row"><span class="n">${esc(r.name)}${r.user ? `<small class="u">${esc(r.user)}</small>` : ""}</span><span class="g">${crowned ? `${esc(crowned.title)} of ${esc(crowned.name)}` : theirs ? `of ${esc(this.nations[theirs].name)}` : "free"}</span><span class="a">${can && !crowned ? `<button data-p="${r.pid}" data-r="citizen">As a citizen</button>${crown ? `<button data-p="${r.pid}" data-r="governor">As a governor</button>` : ""}` : ""}</span></div>`; }).join("")
          : `<p class="gov-why">There's no one else here to ask just now.</p>`);
      for (const b of body.querySelectorAll("button[data-p]")) b.onclick = () => { this.net.send({ t: "natinvite", pid: b.dataset.p, role: b.dataset.r }); b.disabled = true; b.textContent = "Asked"; };
    } else {
      const list = Object.entries(this.nations || {});
      body.innerHTML = `<div class="gov-sec">The realms in this land</div>` + (list.length ? list.map(([id, x]) => `<div class="mp-pl realm-row"><span class="n">${esc(x.name)}</span><span class="g">${esc(x.title)} ${esc(this.nameOfPid(id) || "")} · ${Object.keys(x.members).length} ${Object.keys(x.members).length === 1 ? "soul" : "souls"}</span><span class="a">${id === this.natOf(this.pid) ? "<i>yours</i>" : ""}</span></div>`).join("") : `<p class="gov-why">No one has raised a town hall yet. The first to do it is the first crowned.</p>`);
    }
  },
  // the nation's town hall (its crown's)
  natHall(n) { for (const e of this.w.blds.values()) if (e.b.type === "hearth" && e.b.owner === n) return e; return null; },
};
