# Futbol Elo

Pure-Elo ratings for men's international football, computed **live in the browser**
from the open source dataset. There is nothing to update: every time the page loads
it pulls the latest match results and recomputes every team's Elo from 1872 to today.

**Live site:** https://garcial11.github.io/futbol-elo/

## Elo model

- Win = 1, draw = 0.5, loss = 0. Goal margin is ignored.
- Expected score: `1 / (1 + 10 ** ((Rb - Ra) / 400))`.
- K = 32, every team starts at 1500.
- No home/away, tournament-importance, or friendly adjustment of any kind.

Data: [martj42/international_results](https://github.com/martj42/international_results)
(fetched directly at page load; jsDelivr CDN as a fallback source).

## How it stays current

Nothing to run. The site is plain HTML/CSS/JS on GitHub Pages; on load it downloads
`results.csv` (~1.5 MB gzipped, browser-cached) and computes the full ratings in the
browser in about a tenth of a second. As soon as the community adds new matches to the
dataset, the next page load reflects them. No server, no cron, no publish step.

## Python package (optional, reference)

The `elo/` package is the reference implementation of the same pure-Elo engine, used to
verify the in-browser results and to generate precomputed JSON if ever wanted.

```bash
python -m elo update --no-push  # fetch, recompute, write docs/data/ locally (git-ignored)
python -m elo serve             # preview docs/ at http://localhost:8000
python -m pytest -q             # run the test suite
```

Requirements: Python 3.10+, standard library only at runtime; `pip install pytest` for tests.

## One-time GitHub Pages setup

1. Create a repository on your personal GitHub account (e.g. `futbol-elo`) and push this project.
2. In the repo: **Settings → Pages → Build and deployment → Deploy from a branch**, then choose **`main`** / **`/docs`**.

The site is static, so after the initial deploy you rarely need to touch it — it recomputes
from the live data on every visit.
