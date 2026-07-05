# Futbol Elo

Pure-Elo ratings for men's international football. One command pulls the latest
results, recomputes every team's Elo from 1872 to today, and publishes a static
site.

**Live site:** https://garcial11.github.io/futbol-elo/

## Elo model

- Win = 1, draw = 0.5, loss = 0. Goal margin is ignored.
- Expected score: `1 / (1 + 10 ** ((Rb - Ra) / 400))`.
- K = 32, every team starts at 1500.
- No home/away, tournament-importance, or friendly adjustment of any kind.

Data: [martj42/international_results](https://github.com/martj42/international_results).

## Requirements

Python 3.10+. No third-party runtime dependencies. `pip install pytest` to run tests.

## Update the ratings

```bash
python -m elo update            # fetch latest, recompute, commit + push
python -m elo update --no-push  # recompute only (preview locally)
python -m elo update --no-fetch # reuse the cached download
python -m elo serve             # preview docs/ at http://localhost:8000
```

Options: `--k 32` (K-factor), `--since 1990` (start year).

## One-time GitHub Pages setup

1. Create a repository on your personal GitHub account (e.g. `futbol-elo`) and push this project.
2. In the repo: **Settings → Pages → Build and deployment → Deploy from a branch**, then choose **`main`** / **`/docs`**.
3. Run `python -m elo update`. It commits `docs/data/` and pushes; the site goes live in ~30s.

## Tests

```bash
python -m pytest -q
```
