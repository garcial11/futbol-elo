# Futbol Elo Rating — Design Spec

**Date:** 2026-07-05
**Status:** Approved for planning

## 1. Goal

A pure-Elo rating system for men's international football. A single local command
pulls the latest match results from an open GitHub dataset, recomputes every team's
Elo from scratch, writes static data files, and pushes them so a GitHub Pages site
renders the current ranking plus historic trend and head-to-head comparison charts.

## 2. Core decisions (locked)

| Decision | Choice |
|---|---|
| Elo variant | **Truly pure** — win/draw/loss only, goal margin ignored |
| K-factor | **32** (default, configurable) |
| Initial rating | **1500** for every team on first appearance |
| Scope | **Men's national teams** (martj42/international_results) |
| Adjustments | **None** — no match importance, no home/away, no friendly weighting |
| Deploy | One command recomputes and **auto commits + pushes**; `--no-push` to skip |
| Team names | Treated **as-is** from the raw data (West Germany ≠ Germany); optional alias map for later |
| Hosting | GitHub Pages from **`docs/` on `main`**, fully self-contained (no CDN) |
| Dependencies | **Python standard library only** at runtime; `pytest` for tests |

## 3. The Elo engine (exact math)

For a match between team A and team B, with pre-match ratings `R_A`, `R_B`:

```
E_A = 1 / (1 + 10 ** ((R_B - R_A) / 400))     # expected score for A
E_B = 1 - E_A
```

Actual score comes from goals only:

```
S_A = 1.0 if A scored more, 0.5 if equal, 0.0 if fewer   (S_B = 1 - S_A)
```

Update (zero-sum, total rating points conserved):

```
R_A' = R_A + K * (S_A - E_A)
R_B' = R_B + K * (S_B - E_B)
```

**No adjustments of any kind:**
- Home/away labels from the dataset are treated as plain "team A / team B".
- The `neutral` flag, city, and country columns are ignored.
- Tournament type is ignored: a friendly moves ratings exactly like a World Cup final.
- Goal margin beyond win/draw/loss has no effect: 1-0 and 6-0 are identical.

**Processing order:** matches sorted strictly by date ascending; same-day matches keep
their original dataset row order (stable sort). Every team is seeded at 1500 the first
time it appears. Ratings are stored as floats; the site rounds for display.

## 4. Data source

- URL: `https://raw.githubusercontent.com/martj42/international_results/master/results.csv`
- Columns used: `date`, `home_team`, `away_team`, `home_score`, `away_score`.
- Columns ignored: `tournament`, `city`, `country`, `neutral`.
- Cached locally at `data/raw/results.csv` (gitignored). `--no-fetch` reuses the cache.

## 5. Code structure

Small, single-purpose modules. The math core has zero I/O so it is fully unit-testable.

```
elo/
  __init__.py
  __main__.py     enables `python -m elo`
  fetch.py        download + cache results.csv from GitHub
  ratings.py      PURE Elo math: expected_score(), apply_match(), compute()   <- core, no I/O
  pipeline.py     orchestrate: load matches -> compute -> build site data structures
  site_data.py    serialize site data to the JSON files docs/ consumes
  deploy.py       git add/commit/push; honors --no-push; no-op when nothing changed
  cli.py          argparse: `update` and `serve` subcommands + flags
tests/
  test_ratings.py    symmetry, draw=0.5, point conservation, hand-computed cases
  test_pipeline.py   parsing, chronological order, skipped rows, slug uniqueness
docs/                the website (served by GitHub Pages)
  .nojekyll
  index.html
  assets/
    app.js
    style.css
    chart.min.js     vendored Chart.js (committed, no external calls)
  data/              GENERATED, committed — this is what goes live
    meta.json
    rankings.json
    teams/<slug>.json
data/
  raw/results.csv    cached download (gitignored)
README.md
.gitignore
```

### Module responsibilities

- **ratings.py** — `compute(matches, k, initial) -> (final_ratings, history)`. Pure function.
  `matches` is a list of normalized records; returns final rating per team plus, for each
  team, the ordered list of post-match rating points. No file or network access.
- **fetch.py** — `get_results(use_cache) -> path`. Downloads via `urllib`, writes cache.
- **pipeline.py** — loads CSV, drops rows with missing/empty scores, normalizes and sorts,
  calls `ratings.compute`, assembles the ranking table and per-team histories, computes
  peak rating + date, current rank, and win/draw/loss record.
- **site_data.py** — writes `meta.json`, `rankings.json`, and one file per team under
  `docs/data/teams/`. Slugs: lowercase, accents stripped, non-alphanumerics to hyphens,
  de-duplicated with a numeric suffix if two names collide.
- **deploy.py** — `git add docs/`, commit `Update ratings <date>`, push. Detects
  "nothing to commit" and skips cleanly. Skipped entirely when `--no-push` is set.
- **cli.py** — the command surface (section 6).

## 6. Command line interface

```
python -m elo update [--no-fetch] [--no-push] [--k 32] [--since YYYY]
python -m elo serve  [--port 8000]
```

- `update` runs the full loop: fetch -> compute -> write -> deploy, then prints a summary
  (top 10 teams, matches processed, teams tracked, date range, whether it pushed).
- `--no-push` — recompute and write files but do not commit or push (local preview).
- `--no-fetch` — reuse the cached CSV instead of downloading.
- `--k` — override the K-factor (default 32).
- `--since` — only process matches on/after this year (default: all history from 1872).
- `serve` — start `http.server` over `docs/` for local preview before pushing.

## 7. Generated data files (site contract)

**`docs/data/meta.json`**
```json
{
  "generated_at": "2026-07-05",
  "k": 32,
  "initial_rating": 1500,
  "match_count": 48231,
  "team_count": 234,
  "date_range": ["1872-11-30", "2026-07-01"]
}
```

**`docs/data/rankings.json`** — current table, sorted by rating desc:
```json
[
  {"rank": 1, "team": "Brazil", "slug": "brazil", "rating": 2043.5,
   "matches": 1052, "last_match": "2026-06-30",
   "peak": 2100.2, "peak_date": "2013-06-01"}
]
```

**`docs/data/teams/<slug>.json`** — one per team, its full trend:
```json
{
  "team": "Brazil",
  "slug": "brazil",
  "history": [
    {"date": "1914-07-21", "rating": 1512.0, "opponent": "Argentina",
     "result": "W", "score": "3-0"}
  ]
}
```

`rating` in history is the post-match value. `score` is shown only in tooltips; it has no
effect on the rating. Splitting history per team keeps the initial page load small — the
site fetches a team's file only when the user opens or compares it.

## 8. The website (static, no build step)

Plain HTML + vanilla JS + vendored Chart.js. Three views in one page (client-side routing
or tabs):

1. **Rankings** — sortable, searchable table of all teams: rank, rating, matches, last match.
2. **Team** — pick one team: full Elo trend line, peak rating + date, current rank, W/D/L record.
3. **Compare** — overlay up to 5 teams on one chart, with a year-range slider to zoom the timeline.

No external network calls: Chart.js is vendored, data is same-origin JSON. Works offline.

## 9. Deployment

- One-time GitHub setup (documented in README): create the repo on the personal account,
  push, then Settings -> Pages -> Deploy from branch -> `main` / `docs`.
- `.nojekyll` in `docs/` so Pages serves assets as-is without Jekyll processing.
- Every `update` (without `--no-push`) commits `docs/data/` and pushes; Pages redeploys in ~30s.
- Per-team files change only when that team plays, so update diffs stay localized.

## 10. Testing

- `pytest`. Core coverage on `ratings.py`:
  - Expected score is symmetric and sums to 1.
  - Equal ratings + draw -> no change; equal ratings + win -> ±K/2.
  - Point conservation: total rating unchanged after any match.
  - A hand-computed multi-match sequence matches expected floats.
- `pipeline.py`: rows with missing scores are skipped; chronological ordering is stable;
  slugs are unique; a new team enters at 1500.

## 11. Edge cases

- Missing/empty score cells -> row skipped (covers future scheduled fixtures with no result).
- Same-date matches -> stable order preserving CSV sequence.
- First appearance of a team -> seeded at 1500.
- Name changes (West Germany, Yugoslavia, Serbia, Czechoslovakia) -> distinct teams by default.
  Optional `aliases.json` (variant -> canonical) applied at load if the file is present.
- `deploy` with no changes -> commit skipped, no error.

## 12. Ruled out

- SQLite-in-browser or an API backend — overkill and costs money; static JSON is faster and free.
- React/Vite build — adds a Node toolchain for no benefit; no-build vanilla JS is simpler to host.
- GitHub Actions scheduled refresh — local control was requested; easy opt-in later.

## 13. Suggested repo name

`futbol-elo` (personal GitHub account).

---

*Spec lives in `specs/` (not `docs/`) so it stays out of the GitHub Pages web root.*
