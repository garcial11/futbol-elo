// Pure-Elo rating engine: CSV -> matches -> ratings. No DOM, no I/O.
// Loaded before app.js in the browser (functions become globals), and required
// from Node by tests/test_js_parity.py to check parity with the Python reference.
const CSV_SOURCES = [
  "https://raw.githubusercontent.com/martj42/international_results/master/results.csv",
  "https://cdn.jsdelivr.net/gh/martj42/international_results@master/results.csv",
];
const K_FACTOR = 32, INITIAL = 1500;
const round1 = x => Math.round(x * 10) / 10;

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

const INT_RE = /^[+-]?\d+$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
function buildMatches(rows){
  const H = rows[0], ci = n => H.indexOf(n);
  const di = ci("date"), hti = ci("home_team"), ati = ci("away_team"),
        hsi = ci("home_score"), asi = ci("away_score");
  if([di, hti, ati, hsi, asi].some(x => x < 0))
    throw new Error("CSV columns not as expected: " + H.join(","));
  const need = Math.max(di, hti, ati, hsi, asi);
  const matches = [];
  for(let i = 1; i < rows.length; i++){
    const r = rows[i];
    if(r.length <= need) continue;
    const date = (r[di] || "").trim();
    if(!DATE_RE.test(date)) continue;   // drop malformed/hostile dates (keeps innerHTML + Date.parse safe)
    const hs = (r[hsi] || "").trim(), as = (r[asi] || "").trim();
    if(!INT_RE.test(hs) || !INT_RE.test(as)) continue;   // skip empty / "NA" / future fixtures
    matches.push({ i, date, a: (r[hti] || "").trim(),
                   b: (r[ati] || "").trim(), ga: +hs, gb: +as });
  }
  matches.sort((x, y) => x.date < y.date ? -1 : x.date > y.date ? 1 : x.i - y.i);  // stable by date
  return matches;
}

// Mirror of the Python reference: NFKD, drop all non-ASCII (= ascii-encode ignore),
// lowercase, non-alphanumerics to hyphens, trim.
function slugify(name){
  return name.normalize("NFKD").replace(/[^\x00-\x7F]/g, "").toLowerCase()
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

// Node (tests) can require this; the browser ignores it (module is undefined).
if (typeof module !== "undefined" && module.exports) {
  module.exports = { CSV_SOURCES, K_FACTOR, INITIAL, round1, parseCSV, buildMatches, slugify, computeSite };
}
