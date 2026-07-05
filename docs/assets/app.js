// Pure-Elo ratings, computed live in your browser from the open source dataset.
// No precomputed files, no server, no update step — the page is current on every load.
const CSV_SOURCES = [
  "https://raw.githubusercontent.com/martj42/international_results/master/results.csv",
  "https://cdn.jsdelivr.net/gh/martj42/international_results@master/results.csv",
];
const K_FACTOR = 32, INITIAL = 1500;
const COLORS = ["#38bdf8", "#f87171", "#4ade80", "#fbbf24", "#c084fc"];
const state = { meta:null, rankings:[], teams:{}, sortKey:"rank", sortDir:1,
                teamChart:null, compareChart:null, compare:new Set(),
                asOf:null, asOfRows:[] };

const rnd = n => Math.round(n);
const round1 = x => Math.round(x * 10) / 10;
const ts = d => Date.parse(d);
const yearOf = d => +d.slice(0,4);
const esc = s => s.replace(/[&<>"']/g, c =>
  ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[c]));
const getTeam = slug => state.teams[slug];   // in-memory; stays fine behind `await`

async function loadCSV(){
  let err;
  for(const url of CSV_SOURCES){
    try { const r = await fetch(url); if(r.ok) return r.text(); err = new Error(`${url} -> ${r.status}`); }
    catch(e){ err = e; }
  }
  throw err || new Error("no data source reachable");
}
function parseCSV(text){
  if(text.charCodeAt(0) === 0xFEFF) text = text.slice(1);   // strip BOM if present
  const rows = []; let field = "", row = [], inQ = false;
  for(let i = 0; i < text.length; i++){
    const c = text[i];
    if(inQ){
      if(c === '"'){ if(text[i + 1] === '"'){ field += '"'; i++; } else inQ = false; }
      else field += c;
    } else if(c === '"') inQ = true;
    else if(c === ',') { row.push(field); field = ""; }
    else if(c === '\n'){ row.push(field); rows.push(row); row = []; field = ""; }
    else if(c !== '\r') field += c;
  }
  if(field.length || row.length){ row.push(field); rows.push(row); }
  return rows;
}
const INT_RE = /^-?\d+$/;
function buildMatches(rows){
  const H = rows[0], ci = n => H.indexOf(n);
  const di = ci("date"), hti = ci("home_team"), ati = ci("away_team"),
        hsi = ci("home_score"), asi = ci("away_score");
  const matches = [];
  for(let i = 1; i < rows.length; i++){
    const r = rows[i];
    if(r.length <= asi) continue;
    const hs = (r[hsi] || "").trim(), as = (r[asi] || "").trim();
    if(!INT_RE.test(hs) || !INT_RE.test(as)) continue;   // skip empty / "NA" / future fixtures
    matches.push({ i, date: (r[di] || "").trim(), a: (r[hti] || "").trim(),
                   b: (r[ati] || "").trim(), ga: +hs, gb: +as });
  }
  matches.sort((x, y) => x.date < y.date ? -1 : x.date > y.date ? 1 : x.i - y.i);  // stable by date
  return matches;
}
function slugify(name){
  return name.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}
function computeSite(matches){
  const ratings = {}, history = {};
  for(const m of matches){
    const ra = ratings[m.a] ?? INITIAL, rb = ratings[m.b] ?? INITIAL;
    const ea = 1 / (1 + Math.pow(10, (rb - ra) / 400));
    const sa = m.ga > m.gb ? 1 : m.ga === m.gb ? 0.5 : 0;
    const na = ra + K_FACTOR * (sa - ea), nb = rb + K_FACTOR * ((1 - sa) - (1 - ea));
    ratings[m.a] = na; ratings[m.b] = nb;
    const rA = sa === 1 ? "W" : sa === 0 ? "L" : "D";
    const rB = sa === 1 ? "L" : sa === 0 ? "W" : "D";
    (history[m.a] || (history[m.a] = [])).push(
      { date: m.date, rating: na, opponent: m.b, result: rA, score: `${m.ga}-${m.gb}` });
    (history[m.b] || (history[m.b] = [])).push(
      { date: m.date, rating: nb, opponent: m.a, result: rB, score: `${m.gb}-${m.ga}` });
  }
  const ordered = Object.keys(ratings).sort((a, b) => (ratings[b] - ratings[a]) || (a < b ? -1 : 1));
  const taken = new Set(), rankings = [], teams = {};
  ordered.forEach((team, i) => {
    let base = slugify(team) || "team", slug = base, n = 2;
    while(taken.has(slug)){ slug = `${base}-${n}`; n++; }
    taken.add(slug);
    const h = history[team];
    let peak = h[0];
    for(let j = 1; j < h.length; j++) if(h[j].rating > peak.rating) peak = h[j];
    rankings.push({ rank: i + 1, team, slug, rating: round1(ratings[team]), matches: h.length,
      last_match: h[h.length - 1].date, peak: round1(peak.rating), peak_date: peak.date });
    teams[slug] = { team, slug, history: h.map(e => ({ date: e.date, rating: round1(e.rating),
      opponent: e.opponent, result: e.result, score: e.score })) };
  });
  const meta = { k: K_FACTOR, match_count: matches.length, team_count: ordered.length,
    date_range: [matches[0].date, matches[matches.length - 1].date] };
  return { rankings, teams, meta };
}

// tabs
document.querySelectorAll(".tab").forEach(btn => btn.addEventListener("click", () => {
  document.querySelectorAll(".tab").forEach(b => b.classList.remove("active"));
  document.querySelectorAll(".view").forEach(v => v.classList.remove("active"));
  btn.classList.add("active");
  document.getElementById("view-" + btn.dataset.view).classList.add("active");
}));

// rankings
function renderRankings(){
  const q = document.getElementById("search").value.toLowerCase();
  const k = state.sortKey, dir = state.sortDir;
  const source = state.asOf ? state.asOfRows : state.rankings;
  const rows = source
    .filter(t => t.team.toLowerCase().includes(q))
    .sort((a,b) => (a[k] > b[k] ? 1 : a[k] < b[k] ? -1 : 0) * dir);
  document.querySelector("#rankings-table tbody").innerHTML = rows.map(t =>
    `<tr><td>${t.rank}</td><td>${esc(t.team)}</td><td>${rnd(t.rating)}</td>` +
    `<td>${t.matches}</td><td>${rnd(t.peak)}</td><td>${t.last_match}</td></tr>`).join("");
}

// ranking as of a past date, reconstructed from the in-memory team histories
function computeAsOf(dateStr){
  const rows = [];
  for(const slug in state.teams){
    const t = state.teams[slug];
    let rating = null, matches = 0, peak = -1, last = null;
    for(const e of t.history){          // chronological; ISO dates sort as strings
      if(e.date <= dateStr){ rating = e.rating; matches++; if(e.rating > peak) peak = e.rating; last = e.date; }
      else break;
    }
    if(rating !== null) rows.push({ team: t.team, slug, rating, matches, peak, last_match: last });
  }
  rows.sort((a,b) => b.rating - a.rating || (a.team < b.team ? -1 : 1));
  rows.forEach((row, i) => row.rank = i + 1);
  return rows;
}
function applyAsOf(dateStr){
  const label = document.getElementById("asof-label");
  if(!dateStr){ state.asOf = null; label.textContent = ""; renderRankings(); return; }
  state.asOf = dateStr;
  state.asOfRows = computeAsOf(dateStr);
  label.textContent = `${state.asOfRows.length} teams had played by ${dateStr}`;
  renderRankings();
}
document.getElementById("asof-date").addEventListener("change", e => applyAsOf(e.target.value));
document.getElementById("asof-reset").addEventListener("click", () => {
  document.getElementById("asof-date").value = "";
  applyAsOf(null);
});
document.getElementById("search").addEventListener("input", renderRankings);
document.querySelectorAll("#rankings-table th").forEach(th => th.addEventListener("click", () => {
  const key = th.dataset.key;
  state.sortDir = state.sortKey === key ? -state.sortDir : 1;
  state.sortKey = key;
  renderRankings();
}));

// chart config (numeric x = timestamp, no date adapter needed)
function lineConfig(series){
  return {
    type: "line",
    data: { datasets: series.map(s => ({
      label: s.label, data: s.data, borderColor: s.color,
      borderWidth: 1.5, pointRadius: 0, tension: 0.1 })) },
    options: {
      parsing: false, animation: false, responsive: true, maintainAspectRatio: false,
      interaction: { mode: "nearest", intersect: false },
      scales: {
        x: { type: "linear", ticks: { callback: v => new Date(v).getFullYear() },
             grid: { color: "#33415580" } },
        y: { title: { display: true, text: "Elo" }, grid: { color: "#33415580" } },
      },
      plugins: {
        legend: { labels: { color: "#e2e8f0" } },
        tooltip: { callbacks: { title: items => new Date(items[0].parsed.x).toISOString().slice(0,10) } },
      },
    },
  };
}

// team view
async function renderTeam(slug){
  const t = await getTeam(slug);
  const ratings = t.history.map(h => h.rating);
  const peak = Math.max(...ratings), cur = ratings[ratings.length-1];
  const rec = t.history.reduce((a,h) => (a[h.result]++, a), {W:0,D:0,L:0});
  document.getElementById("team-stats").innerHTML =
    `<b>${esc(t.team)}</b> · Current ${rnd(cur)} · Peak ${rnd(peak)} · ` +
    `${t.history.length} matches · ${rec.W}W-${rec.D}D-${rec.L}L`;
  const data = t.history.map(h => ({ x: ts(h.date), y: h.rating }));
  if(state.teamChart) state.teamChart.destroy();
  state.teamChart = new Chart(document.getElementById("team-chart"),
    lineConfig([{ label: t.team, data, color: COLORS[0] }]));
  renderRecent(t);
}

// last 10 matches, most recent first, with the rating change each caused
function renderRecent(t){
  const h = t.history;
  const rows = [];
  for(let i = h.length - 1; i >= 0 && rows.length < 10; i--){
    const prev = i > 0 ? h[i - 1].rating : 1500;   // first-ever match starts from 1500
    rows.push(
      `<tr><td>${h[i].date}</td><td>${esc(h[i].opponent)}</td>` +
      `<td class="res-${h[i].result}">${h[i].result}</td>` +
      `<td class="num">${h[i].score}</td>` +
      `<td class="num">${rnd(h[i].rating)}</td>` +
      `<td class="num">${deltaSpan(h[i].rating - prev)}</td></tr>`);
  }
  document.getElementById("team-recent").innerHTML =
    `<table><thead><tr><th>Date</th><th>Opponent</th><th>Res</th>` +
    `<th>Score</th><th>Rating</th><th>Δ</th></tr></thead>` +
    `<tbody>${rows.join("")}</tbody></table>`;
}

// compare view — search box + removable chips (up to 5 teams)
const teamName = slug => (state.teams[slug] || {}).team || slug;

function renderChips(){
  const box = document.getElementById("compare-chips");
  box.innerHTML = [...state.compare].map((slug, i) =>
    `<span class="chip" style="border-color:${COLORS[i % COLORS.length]}">` +
      `<span class="dot" style="background:${COLORS[i % COLORS.length]}"></span>` +
      `${esc(teamName(slug))}` +
      `<button class="chip-x" data-slug="${slug}" aria-label="Remove ${esc(teamName(slug))}">×</button>` +
    `</span>`).join("");
  box.querySelectorAll(".chip-x").forEach(b =>
    b.addEventListener("click", () => removeTeam(b.dataset.slug)));
}

function renderResults(){
  const q = document.getElementById("team-search").value.trim().toLowerCase();
  const box = document.getElementById("team-results");
  const full = state.compare.size >= 5;
  const matches = !q || full ? [] : state.rankings
    .filter(t => !state.compare.has(t.slug) && t.team.toLowerCase().includes(q))
    .slice(0, 8);
  box.innerHTML = full && q
    ? `<div class="result-note">Remove a team first (max 5).</div>`
    : matches.map(t =>
        `<button class="result" data-slug="${t.slug}">${esc(t.team)} ` +
        `<span class="mono">${rnd(t.rating)}</span></button>`).join("");
  box.classList.toggle("open", (matches.length > 0) || (full && !!q));
  box.querySelectorAll(".result").forEach(btn =>
    btn.addEventListener("click", () => addTeam(btn.dataset.slug)));
}

async function addTeam(slug){
  if(state.compare.size >= 5 || state.compare.has(slug)) return;
  state.compare.add(slug);
  const search = document.getElementById("team-search");
  search.value = "";
  search.focus();
  renderResults();
  renderChips();
  await renderCompare();
}
async function removeTeam(slug){
  state.compare.delete(slug);
  renderResults();
  renderChips();
  await renderCompare();
}
document.getElementById("team-search").addEventListener("input", renderResults);
// close any open dropdown when clicking outside its combo
document.addEventListener("click", e => {
  document.querySelectorAll(".results.open").forEach(r => {
    if(!r.closest(".combo").contains(e.target)) r.classList.remove("open");
  });
});
function labelRange(){
  const lo = document.getElementById("year-min").value, hi = document.getElementById("year-max").value;
  document.getElementById("year-label").textContent = `${lo}–${hi}`;
}
async function renderCompare(){
  labelRange();
  const lo = +document.getElementById("year-min").value, hi = +document.getElementById("year-max").value;
  const teams = await Promise.all([...state.compare].map(getTeam));
  const series = teams.map((t,i) => ({
    label: t.team, color: COLORS[i % COLORS.length],
    data: t.history.filter(h => { const y = yearOf(h.date); return y >= lo && y <= hi; })
                   .map(h => ({ x: ts(h.date), y: h.rating })),
  }));
  if(state.compareChart) state.compareChart.destroy();
  state.compareChart = new Chart(document.getElementById("compare-chart"), lineConfig(series));
}
["year-min","year-max"].forEach(id => document.getElementById(id).addEventListener("input", () => {
  if(state.compare.size) renderCompare(); else labelRange();
}));

// reusable single-select team picker (used by the What-if calculator)
function attachPicker(inputId, resultsId, onPick, isExcluded){
  const input = document.getElementById(inputId);
  const results = document.getElementById(resultsId);
  input.addEventListener("input", () => {
    const q = input.value.trim().toLowerCase();
    const matches = !q ? [] : state.rankings
      .filter(t => t.team.toLowerCase().includes(q) && !(isExcluded && isExcluded(t.slug)))
      .slice(0, 8);
    results.innerHTML = matches.map(t =>
      `<button class="result" data-slug="${t.slug}">${esc(t.team)} ` +
      `<span class="mono">${rnd(t.rating)}</span></button>`).join("");
    results.classList.toggle("open", matches.length > 0);
    results.querySelectorAll(".result").forEach(b =>
      b.addEventListener("click", () => onPick(b.dataset.slug)));
  });
}

// what-if calculator: pure-Elo point + rank change for a hypothetical match
const wi = { a: null, b: null };
const wiExpected = (rA, rB) => 1 / (1 + Math.pow(10, (rB - rA) / 400));

function wiRankOf(slug, over){
  const target = over[slug];
  let rank = 1;
  for(const t of state.rankings){
    if(t.slug === slug) continue;
    const r = over[t.slug] !== undefined ? over[t.slug] : t.rating;
    if(r > target) rank++;
  }
  return rank;
}
function deltaSpan(d){
  const v = Math.round(d);
  const cls = v > 0 ? "up" : v < 0 ? "down" : "flat";
  const sign = v > 0 ? "+" : v < 0 ? "−" : "±";
  return `<span class="${cls}">${sign}${Math.abs(v)}</span>`;
}
function rankArrow(oldR, newR){
  if(newR < oldR) return `<span class="up">#${oldR} → #${newR} ▲</span>`;
  if(newR > oldR) return `<span class="down">#${oldR} → #${newR} ▼</span>`;
  return `<span class="flat">#${oldR} → #${newR}</span>`;
}
function wiTeamLine(t, cur, nw, oldRank, newRank, color){
  return `<div class="wi-team"><span class="dot" style="background:${color}"></span>` +
    `${esc(t.team)} ${rnd(cur)} → <b>${rnd(nw)}</b> ${deltaSpan(nw - cur)} · ` +
    `${rankArrow(oldRank, newRank)}</div>`;
}
async function renderWhatIf(){
  const out = document.getElementById("wi-output");
  if(!(wi.a && wi.b)){ out.innerHTML = ""; return; }
  const A = state.rankings.find(t => t.slug === wi.a);
  const B = state.rankings.find(t => t.slug === wi.b);
  const K = state.meta.k;
  const eA = wiExpected(A.rating, B.rating);
  const scenarios = [
    { label: `${A.team} wins`, sA: 1 },
    { label: "Draw", sA: 0.5 },
    { label: `${B.team} wins`, sA: 0 },
  ];
  const rows = scenarios.map(s => {
    const dA = K * (s.sA - eA);
    const nA = A.rating + dA, nB = B.rating - dA;
    const over = { [A.slug]: nA, [B.slug]: nB };
    return `<div class="wi-row"><div class="wi-label">${esc(s.label)}</div>` +
      wiTeamLine(A, A.rating, nA, A.rank, wiRankOf(A.slug, over), COLORS[0]) +
      wiTeamLine(B, B.rating, nB, B.rank, wiRankOf(B.slug, over), COLORS[1]) +
      `</div>`;
  }).join("");
  out.innerHTML =
    `<div class="wi-head"><b>${esc(A.team)}</b> #${A.rank} · ${rnd(A.rating)} ` +
    `<span class="wi-vs">vs</span> <b>${esc(B.team)}</b> #${B.rank} · ${rnd(B.rating)}` +
    `<div class="wi-prob">${esc(A.team)} win probability: ${Math.round(eA * 100)}%</div></div>` +
    `<div class="wi-scenarios">${rows}</div>` +
    `<div id="wi-h2h" class="wi-h2h"></div>`;

  // head-to-head history, pulled from A's match file (guard against fast re-selection)
  const data = await getTeam(A.slug);
  if(wi.a !== A.slug || wi.b !== B.slug) return;
  renderH2H(A, B, data.history.filter(m => m.opponent === B.team));
}

function renderH2H(A, B, h2h){
  const box = document.getElementById("wi-h2h");
  if(!box) return;
  if(!h2h.length){
    box.innerHTML = `<h3 class="wi-h2h-title">Head-to-head</h3>` +
      `<p class="hint">${esc(A.team)} and ${esc(B.team)} have never played.</p>`;
    return;
  }
  const rec = h2h.reduce((a, m) => (a[m.result]++, a), { W: 0, D: 0, L: 0 });
  const list = h2h.slice().reverse().map(m =>   // most recent first
    `<tr><td>${m.date}</td><td class="res-${m.result}">${m.result}</td>` +
    `<td class="num">${m.score}</td></tr>`).join("");
  box.innerHTML =
    `<h3 class="wi-h2h-title">Head-to-head · ${h2h.length} match${h2h.length > 1 ? "es" : ""}</h3>` +
    `<div class="wi-h2h-summary">${esc(A.team)} ` +
      `<span class="up">${rec.W}W</span>-${rec.D}D-<span class="down">${rec.L}L</span> ` +
      `${esc(B.team)}</div>` +
    `<div class="recent h2h-scroll"><table><thead><tr>` +
      `<th>Date</th><th>Res</th><th>Score</th></tr></thead><tbody>${list}</tbody></table></div>`;
}
function setupWhatIf(){
  attachPicker("wi-a", "wi-a-results", slug => {
    wi.a = slug;
    document.getElementById("wi-a").value = teamName(slug);
    document.getElementById("wi-a-results").classList.remove("open");
    renderWhatIf();
  }, slug => slug === wi.b);
  attachPicker("wi-b", "wi-b-results", slug => {
    wi.b = slug;
    document.getElementById("wi-b").value = teamName(slug);
    document.getElementById("wi-b-results").classList.remove("open");
    renderWhatIf();
  }, slug => slug === wi.a);
}

// method tab — fill live figures from meta
function fillMethod(){
  const m = state.meta;
  document.getElementById("m-k").textContent = m.k;
  document.getElementById("m-matches").textContent = m.match_count.toLocaleString();
  document.getElementById("m-teams").textContent = m.team_count;
  document.getElementById("m-range").textContent = `${m.date_range[0]} to ${m.date_range[1]}`;
}

// init
(async function(){
  const metaLine = document.getElementById("meta-line");
  metaLine.textContent = "Computing ratings from the latest results…";
  let site;
  try {
    const text = await loadCSV();
    site = computeSite(buildMatches(parseCSV(text)));
  } catch(e){
    console.error(e);
    metaLine.textContent = "Couldn't reach the live match data — please refresh in a moment.";
    return;
  }
  state.meta = site.meta; state.rankings = site.rankings; state.teams = site.teams;
  metaLine.textContent =
    `${state.meta.team_count} teams · ${state.meta.match_count.toLocaleString()} matches · ` +
    `K=${state.meta.k} · computed live · latest ${state.meta.date_range[1]}`;
  const y0 = yearOf(state.meta.date_range[0]), y1 = yearOf(state.meta.date_range[1]);
  for(const id of ["year-min","year-max"]){
    const el = document.getElementById(id); el.min = y0; el.max = y1;
  }
  const asof = document.getElementById("asof-date");
  asof.min = state.meta.date_range[0];
  asof.max = state.meta.date_range[1];
  document.getElementById("year-min").value = y0;
  document.getElementById("year-max").value = y1;
  labelRange();
  const sel = document.getElementById("team-select");
  sel.innerHTML = state.rankings.map(t => `<option value="${t.slug}">${esc(t.team)}</option>`).join("");
  sel.addEventListener("change", () => renderTeam(sel.value));
  renderRankings();
  renderChips();
  setupWhatIf();
  fillMethod();
  if(state.rankings.length) renderTeam(state.rankings[0].slug);
})();
