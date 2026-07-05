const DATA = "data";
const COLORS = ["#38bdf8", "#f87171", "#4ade80", "#fbbf24", "#c084fc"];
const state = { meta:null, rankings:[], cache:{}, sortKey:"rank", sortDir:1,
                teamChart:null, compareChart:null, compare:new Set() };

async function loadJSON(p){ const r = await fetch(p); if(!r.ok) throw new Error(p); return r.json(); }
async function getTeam(slug){
  if(!state.cache[slug]) state.cache[slug] = await loadJSON(`${DATA}/teams/${slug}.json`);
  return state.cache[slug];
}
const rnd = n => Math.round(n);
const ts = d => Date.parse(d);
const yearOf = d => +d.slice(0,4);
const esc = s => s.replace(/[&<>"']/g, c =>
  ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[c]));

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
  const rows = state.rankings
    .filter(t => t.team.toLowerCase().includes(q))
    .sort((a,b) => (a[k] > b[k] ? 1 : a[k] < b[k] ? -1 : 0) * dir);
  document.querySelector("#rankings-table tbody").innerHTML = rows.map(t =>
    `<tr><td>${t.rank}</td><td>${esc(t.team)}</td><td>${rnd(t.rating)}</td>` +
    `<td>${t.matches}</td><td>${rnd(t.peak)}</td><td>${t.last_match}</td></tr>`).join("");
}
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
}

// compare view — search box + removable chips (up to 5 teams)
const teamName = slug => (state.rankings.find(t => t.slug === slug) || {}).team || slug;

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
function renderWhatIf(){
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
    `<div class="wi-scenarios">${rows}</div>`;
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
  state.meta = await loadJSON(`${DATA}/meta.json`);
  state.rankings = await loadJSON(`${DATA}/rankings.json`);
  document.getElementById("meta-line").textContent =
    `${state.meta.team_count} teams · ${state.meta.match_count.toLocaleString()} matches · ` +
    `K=${state.meta.k} · updated ${state.meta.generated_at}`;
  const y0 = yearOf(state.meta.date_range[0]), y1 = yearOf(state.meta.date_range[1]);
  for(const id of ["year-min","year-max"]){
    const el = document.getElementById(id); el.min = y0; el.max = y1;
  }
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
