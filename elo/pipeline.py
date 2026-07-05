"""Data pipeline: load CSV -> matches, build site data, orchestrate an update."""
from __future__ import annotations

import csv
import re
import unicodedata
from pathlib import Path

from elo.ratings import DEFAULT_K, INITIAL_RATING, Match, compute
from elo.site_data import write_site_data


def _parse_int(value: str) -> int | None:
    try:
        return int(value.strip())
    except ValueError:
        return None


def load_matches(csv_path: str | Path, since: int | None = None) -> list[Match]:
    rows: list[tuple[int, Match]] = []
    with open(csv_path, newline="", encoding="utf-8") as fh:
        for i, row in enumerate(csv.DictReader(fh)):
            # Skip rows without a real score: empty cells or placeholders like "NA".
            goals_a = _parse_int(row["home_score"])
            goals_b = _parse_int(row["away_score"])
            if goals_a is None or goals_b is None:
                continue
            date = row["date"].strip()
            if since is not None and int(date[:4]) < since:
                continue
            rows.append((i, Match(
                date=date,
                team_a=row["home_team"].strip(),
                team_b=row["away_team"].strip(),
                goals_a=goals_a,
                goals_b=goals_b,
            )))
    # stable sort by date; original index breaks ties to preserve CSV order
    rows.sort(key=lambda pair: (pair[1].date, pair[0]))
    return [m for _, m in rows]


def slugify(name: str) -> str:
    norm = unicodedata.normalize("NFKD", name)
    ascii_ = norm.encode("ascii", "ignore").decode("ascii").lower()
    return re.sub(r"[^a-z0-9]+", "-", ascii_).strip("-")


def _unique_slug(name: str, taken: set[str]) -> str:
    base = slugify(name) or "team"
    slug, n = base, 2
    while slug in taken:
        slug = f"{base}-{n}"
        n += 1
    taken.add(slug)
    return slug


def assemble(ratings, history, matches, k, initial, generated_at) -> dict:
    ordered = sorted(ratings, key=lambda t: (-ratings[t], t))
    taken: set[str] = set()
    slugs = {team: _unique_slug(team, taken) for team in ordered}

    rankings = []
    teams = {}
    for rank, team in enumerate(ordered, start=1):
        hist = history[team]
        peak_point = max(hist, key=lambda h: h["rating"])
        slug = slugs[team]
        rankings.append({
            "rank": rank,
            "team": team,
            "slug": slug,
            "rating": round(ratings[team], 1),
            "matches": len(hist),
            "last_match": hist[-1]["date"],
            "peak": round(peak_point["rating"], 1),
            "peak_date": peak_point["date"],
        })
        teams[slug] = {
            "team": team,
            "slug": slug,
            "history": [{
                "date": h["date"], "rating": round(h["rating"], 1),
                "opponent": h["opponent"], "result": h["result"], "score": h["score"],
            } for h in hist],
        }

    dates = [m.date for m in matches]
    meta = {
        "generated_at": generated_at,
        "k": k,
        "initial_rating": initial,
        "match_count": len(matches),
        "team_count": len(ratings),
        "date_range": [dates[0], dates[-1]] if dates else [None, None],
    }
    return {"meta": meta, "rankings": rankings, "teams": teams}


def run_update(csv_path, out_dir, k=DEFAULT_K, since=None, generated_at="") -> dict:
    matches = load_matches(csv_path, since=since)
    ratings, history = compute(matches, k=k)
    site = assemble(ratings, history, matches, k=k, initial=INITIAL_RATING,
                    generated_at=generated_at)
    write_site_data(site, out_dir)
    return site


def format_summary(site: dict, top: int = 10) -> str:
    m = site["meta"]
    lines = [
        f"Updated {m['generated_at']} — {m['team_count']} teams, "
        f"{m['match_count']} matches, {m['date_range'][0]}..{m['date_range'][1]} (K={m['k']})",
        "",
    ]
    for r in site["rankings"][:top]:
        lines.append(f"{r['rank']:>3}. {r['team']:<24} {r['rating']:>7.1f}  "
                     f"({r['matches']} matches)")
    return "\n".join(lines)
