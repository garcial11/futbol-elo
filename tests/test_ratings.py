import math
import pytest
from elo.ratings import (
    Match, expected_score, apply_match, compute, DEFAULT_K, INITIAL_RATING,
)


def test_expected_score_equal_is_half():
    assert expected_score(1500, 1500) == pytest.approx(0.5)


def test_expected_score_symmetric():
    a, b = 1700, 1500
    assert expected_score(a, b) + expected_score(b, a) == pytest.approx(1.0)


def test_expected_score_favors_higher():
    assert expected_score(1800, 1500) > 0.5


def test_apply_match_equal_win_moves_half_k():
    new_a, new_b = apply_match(1500, 1500, 1.0, k=32)
    assert new_a == pytest.approx(1516.0)
    assert new_b == pytest.approx(1484.0)


def test_apply_match_equal_draw_no_change():
    new_a, new_b = apply_match(1500, 1500, 0.5, k=32)
    assert new_a == pytest.approx(1500.0)
    assert new_b == pytest.approx(1500.0)


def test_apply_match_conserves_points():
    new_a, new_b = apply_match(1712.3, 1489.9, 1.0, k=32)
    assert new_a + new_b == pytest.approx(1712.3 + 1489.9)


def test_compute_seeds_new_team_at_initial():
    ratings, _ = compute([Match("2000-01-01", "A", "B", 1, 0)])
    # A won from 1500 vs 1500 with K=32 -> 1516 / 1484
    assert ratings["A"] == pytest.approx(1516.0)
    assert ratings["B"] == pytest.approx(1484.0)


def test_compute_draw_records_half_result():
    _, history = compute([Match("2000-01-01", "A", "B", 2, 2)])
    assert history["A"][0]["result"] == "D"
    assert history["B"][0]["result"] == "D"
    assert history["A"][0]["score"] == "2-2"


def test_compute_history_is_team_perspective():
    _, history = compute([Match("2000-01-01", "A", "B", 3, 0)])
    assert history["A"][0] == {
        "date": "2000-01-01", "rating": pytest.approx(1516.0),
        "opponent": "B", "result": "W", "score": "3-0",
    }
    assert history["B"][0]["result"] == "L"
    assert history["B"][0]["score"] == "0-3"


def test_compute_two_match_sequence():
    ratings, _ = compute([
        Match("2000-01-01", "A", "B", 1, 0),  # A 1516, B 1484
        Match("2000-01-02", "A", "C", 1, 0),  # A(1516) beats C(1500)
    ])
    # E_A = 1/(1+10**((1500-1516)/400)) = 0.52300...
    assert ratings["A"] == pytest.approx(1516 + 32 * (1 - 0.5230010), abs=1e-3)
