"""Pure Elo math for football ratings. No I/O, no adjustments."""
from __future__ import annotations

from typing import Iterable, NamedTuple

DEFAULT_K: float = 32.0
INITIAL_RATING: float = 1500.0


class Match(NamedTuple):
    date: str
    team_a: str
    team_b: str
    goals_a: int
    goals_b: int


def expected_score(rating_a: float, rating_b: float) -> float:
    return 1.0 / (1.0 + 10.0 ** ((rating_b - rating_a) / 400.0))


def apply_match(
    rating_a: float, rating_b: float, score_a: float, k: float = DEFAULT_K
) -> tuple[float, float]:
    e_a = expected_score(rating_a, rating_b)
    new_a = rating_a + k * (score_a - e_a)
    new_b = rating_b + k * ((1.0 - score_a) - (1.0 - e_a))
    return new_a, new_b


def _result(score_a: float) -> tuple[str, str]:
    """(result_for_a, result_for_b) as W/D/L."""
    if score_a == 1.0:
        return "W", "L"
    if score_a == 0.0:
        return "L", "W"
    return "D", "D"


def compute(
    matches: Iterable[Match],
    k: float = DEFAULT_K,
    initial: float = INITIAL_RATING,
) -> tuple[dict[str, float], dict[str, list[dict]]]:
    ratings: dict[str, float] = {}
    history: dict[str, list[dict]] = {}
    for m in matches:
        ra = ratings.get(m.team_a, initial)
        rb = ratings.get(m.team_b, initial)
        if m.goals_a > m.goals_b:
            score_a = 1.0
        elif m.goals_a == m.goals_b:
            score_a = 0.5
        else:
            score_a = 0.0
        new_a, new_b = apply_match(ra, rb, score_a, k)
        ratings[m.team_a] = new_a
        ratings[m.team_b] = new_b
        res_a, res_b = _result(score_a)
        history.setdefault(m.team_a, []).append({
            "date": m.date, "rating": new_a, "opponent": m.team_b,
            "result": res_a, "score": f"{m.goals_a}-{m.goals_b}",
        })
        history.setdefault(m.team_b, []).append({
            "date": m.date, "rating": new_b, "opponent": m.team_a,
            "result": res_b, "score": f"{m.goals_b}-{m.goals_a}",
        })
    return ratings, history
