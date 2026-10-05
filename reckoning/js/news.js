// ===========================================================================
//  FORESTER: RECKONING — Copyright (c) 2026 Roan Fraese / DeadlyDog Productions
// ===========================================================================
// THE NEWS: what has been going on in the settlements, written down as it happens — who was born and who died,
// who came and who went, who sold what to the pedlar, who stole, who quarrelled, what went up and what came down —
// and printed as a broadsheet at the news stand (Broadsheets, a root of the tech tree). G.report(text, kind, where)
// is how the rest of the game says so; the big stories (UI.news) are taken down by themselves.
import { G } from "./engine.js";
import { UI } from "./ui.js";
import { TECH } from "./gov.js";
import { SEASONS, YEAR } from "./town.js";

const KEEP = 400;
// the sections of the paper, in the order they're printed under each day
export const NEWS_KINDS = {
  big: "Chief news", people: "Births, deaths & comings", trade: "Trade & the treasury", crime: "Crime & the watch",
  quarrel: "Quarrels", work: "Building & the works", trouble: "Hardship", abroad: "Word from abroad",
};

// set down one item (the same thing twice on one day is set down once)
export function report(town, text, kind = "work", where = null) {
  if (!town || !town.S || !text) return;
  text = clean(text);
  const N = (town.S.news ??= []);
  if (N.some(n => n.d === town.day && n.t === text)) return;
  const dayLen = town.dayLen || 600, f = ((town.t % dayLen) + dayLen) % dayLen / dayLen;
  N.push({ d: town.day, f: Math.round(f * 100) / 100, k: kind, t: text, w: where || null });
  if (N.length > KEEP) N.splice(0, N.length - KEEP);
}

// the paper prints what happened, not the advice to you: bracketed keys and asides, and "— F beside them..." go
const clean = t => String(t)
  .replace(/\s*\((?:[^()]*\b(?:F|G|J|V|B|K|Research)\b[^()]*|\d+)\)/g, "")
  .replace(/\s*[—–-]\s*(?:F|G|J|V|B)\b[^.]*\./g, ".").replace(/ — see G, People, for why\./g, ".")
  .replace(/\.\.+/g, ".").replace(/([.!?])\s*—\s*/g, "$1 ").replace(/\s+/g, " ").trim();

// the paper's name: after the settlement
export const paperName = S => `The ${(S && S.name) || "Clearing"} Courant`;

// the big stories, taken down as they're told (and the europe news as word from abroad)
let wrapped = false;
function wrapNews() {
  if (wrapped || !UI.news) return; wrapped = true;
  const told = UI.news.bind(UI);
  UI.news = n => {
    try { if (G.report && n && n.title) G.report(`${n.title}${/[.!?]$/.test(n.title) ? "" : "."} ${n.sub || ""}`.trim(), n.abroad ? "abroad" : "big", n.where); } catch (e) {}
    return told(n);
  };
}

// a town's news: its own events, as they happen
export function hookNews(town) {
  wrapNews();
  G.report = (text, kind, where) => { if (G.town) report(G.town, text, kind, where); };
  const at = b => (b && town.inColony && town.inColony(b.x, b.z) || {}).name || null;
  const nameOf = b => (town.nameOf ? town.nameOf(b) : b.type).toLowerCase();
  town.on("built", b => { if (b.type !== "path" && b.type !== "field") report(town, `A ${nameOf(b)} is finished${b.type === "cabin" ? ", and a family will sleep under its roof" : ""}.`, "work", at(b)); });
  town.on("upgraded", b => report(town, `The ${nameOf(b)} is rebuilt, and grander.`, "work", at(b)));
  town.on("dismantled", b => { if (b.type !== "path") report(town, `The ${nameOf(b)} is pulled down.`, "work", at(b)); });
  town.on("reaped", (f, got) => report(town, `A field of rye is reaped${got ? `: ${got} rye into the stores` : ""}.`, "work", at(f)));
  town.on("researched", id => { const t = TECH[id]; report(town, `The scholars have finished their study of ${t ? t.name : id}${t ? ` — ${t.desc}` : ""}.`, "big"); });
  town.on("left", (p, why) => report(town, `${p.name} has gone back down the road — ${why === "cold" ? "there wasn't wood enough for a fire" : why === "unhappy" ? "they couldn't bear it here any longer" : "there wasn't bread enough"}.`, "people", p.home));
  town.on("hungry", () => report(town, "The stores ran out of food today. Nobody ate their fill.", "trouble"));
  town.on("cold", () => report(town, "There was no wood for the hearths last night. The houses were cold.", "trouble"));
  town.on("sold", got => report(town, `The market sold the surplus for ${got} DM.`, "trade"));
  town.on("raid", n => report(town, `Raiders on the road — ${n} of them, after the stores.`, "big"));
  town.on("expand", () => report(town, "The settlement has claimed more ground from the forest. The trees on it are coming down.", "work"));
  town.on("day", () => {
    const S = town.S, tx = S.taxToday;
    if (tx && (tx.taxed || tx.biz)) report(town, `The tax was gathered: ${tx.taxed} DM on wages${tx.clerk ? ` (the town hall's clerk found ${tx.clerk} of it)` : ""}${tx.biz ? `, and ${tx.biz} DM on the businesses' trade` : ""}.`, "trade");
  });
}

// ---- the broadsheet ----
const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const WHEN = f => f < 0.12 ? "at dawn" : f < 0.4 ? "in the morning" : f < 0.55 ? "at midday" : f < 0.7 ? "in the afternoon" : f < 0.85 ? "in the evening" : "in the night";
let view = { where: null, kind: null };
export function setNewsView(where) { view = { where: where ?? null, kind: null }; }

export function renderNews(el, town) {
  if (!el || !town) return;
  const S = town.S, all = S.news || [], home = S.name || "Forester's Clearing";
  const places = [...new Set([home, ...(S.colonies || []).map(c => c.name)])];
  const placeOf = n => n.w || home;
  const shown = all.filter(n => (!view.where || placeOf(n) === view.where) && (!view.kind || n.k === view.kind));
  const days = new Map();
  for (const n of shown.slice().reverse()) (days.get(n.d) || days.set(n.d, []).get(n.d)).push(n);
  const season = d => SEASONS[((d % YEAR) + YEAR) % YEAR];
  const yearOf = d => Math.floor(d / YEAR) + 1;
  // the masthead's own figures: today, as the paper goes to press
  const tx = S.taxToday || {}, pop = (S.people || []).filter(p => !view.where || (p.home || home) === view.where).length;
  const food = town.foodDays ? town.foodDays() : null;
  const tab = (k, label, on) => `<button class="np-tab${on ? " on" : ""}" ${k}>${esc(label)}</button>`;
  el.innerHTML = `
    <div class="np-mast">
      <div class="np-rule">Printed &amp; sold at the news stand · price one pfennig</div>
      <div class="np-title">${esc(paperName(S))}</div>
      <div class="np-rule">Day ${town.day + 1} · ${esc(season(town.day))}, year ${yearOf(town.day)} · ${pop} souls${view.where ? ` in ${esc(view.where)}` : ""}${food != null && !view.where ? ` · food for ${Math.floor(food)} days` : ""} · treasury ${G.dm ? esc(G.dm(S.coin || 0)) : (S.coin || 0)}${tx.taxed != null ? ` · yesterday's tax ${tx.taxed + (tx.biz || 0)} DM` : ""}</div>
    </div>
    ${places.length > 1 ? `<div class="np-tabs">${tab('data-w=""', "All settlements", !view.where)}${places.map(p => tab(`data-w="${esc(p)}"`, p, view.where === p)).join("")}</div>` : ""}
    <div class="np-tabs">${tab('data-k=""', "Everything", !view.kind)}${Object.entries(NEWS_KINDS).filter(([k]) => all.some(n => n.k === k)).map(([k, l]) => tab(`data-k="${k}"`, l, view.kind === k)).join("")}</div>
    <div class="np-body"><div class="np-cols">${days.size ? [...days].map(([d, ns]) => {
      const secs = Object.keys(NEWS_KINDS).map(k => [k, ns.filter(n => n.k === k)]).filter(([, a]) => a.length);
      return `<section class="np-day"><h3>${d === town.day ? "Today" : d === town.day - 1 ? "Yesterday" : `Day ${d + 1}`} <span>${esc(season(d))}, year ${yearOf(d)}</span></h3>${secs.map(([k, a]) => `<h4>${esc(NEWS_KINDS[k])}</h4>${a.slice().reverse().map(n => `<p${k === "big" ? ' class="np-big"' : ""}>${esc(n.t)}<em> — ${WHEN(n.f)}${places.length > 1 && !view.where ? `, ${esc(placeOf(n))}` : ""}</em></p>`).join("")}`).join("")}</section>`;
    }).join("") : `<p class="np-none">Nothing to report${view.kind || view.where ? " under that heading" : " yet"}.</p>`}</div></div>`;
  for (const b of el.querySelectorAll("[data-w]")) b.onclick = () => { view.where = b.dataset.w || null; renderNews(el, town); };
  for (const b of el.querySelectorAll("[data-k]")) b.onclick = () => { view.kind = b.dataset.k || null; renderNews(el, town); };
}

// said on the screen and set down in the paper at once (the bracketed advice to you is left out of the paper)
G.tell = (kind, where, text, secs) => {
  if (G.report) G.report(text, kind, where);
  UI.hint(text, secs);
};
