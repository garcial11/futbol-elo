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

// compare view
function buildPicker(){
  const p = document.getElementById("compare-picker");
  p.innerHTML = state.rankings.map(t =>
    `<label><input type="checkbox" value="${t.slug}"> ${esc(t.team)}</label>`).join("");
  p.querySelectorAll("input").forEach(cb => cb.addEventListener("change", onCompareToggle));
}
async function onCompareToggle(e){
  const slug = e.target.value;
  if(e.target.checked){
    if(state.compare.size >= 5){ e.target.checked = false; return; }
    state.compare.add(slug);
  } else state.compare.delete(slug);
  await renderCompare();
}
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
  buildPicker();
  if(state.rankings.length) renderTeam(state.rankings[0].slug);
})();
