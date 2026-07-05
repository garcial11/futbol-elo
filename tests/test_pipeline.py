from pathlib import Path
from elo.ratings import Match, compute
from elo.pipeline import load_matches, slugify, assemble


def _write(tmp_path, text):
    p = tmp_path / "r.csv"
    p.write_text(text, encoding="utf-8")
    return p


HEADER = "date,home_team,away_team,home_score,away_score,tournament,city,country,neutral\n"


def test_load_skips_missing_scores(tmp_path):
    csv = _write(tmp_path, HEADER +
        "2000-01-02,A,B,1,0,Friendly,X,Y,FALSE\n"
        "2000-01-03,B,C,,,Friendly,X,Y,FALSE\n")
    matches = load_matches(csv)
    assert len(matches) == 1
    assert matches[0].team_a == "A" and matches[0].goals_a == 1


def test_load_sorts_by_date_stable(tmp_path):
    csv = _write(tmp_path, HEADER +
        "2000-03-01,C,D,1,1,F,X,Y,FALSE\n"
        "2000-01-01,A,B,2,0,F,X,Y,FALSE\n")
    dates = [m.date for m in load_matches(csv)]
    assert dates == ["2000-01-01", "2000-03-01"]


def test_load_since_filters_by_year(tmp_path):
    csv = _write(tmp_path, HEADER +
        "1998-06-01,A,B,1,0,F,X,Y,FALSE\n"
        "2010-06-01,C,D,2,2,F,X,Y,FALSE\n")
    matches = load_matches(csv, since=2000)
    assert [m.date for m in matches] == ["2010-06-01"]


def test_slugify_basic():
    assert slugify("Brazil") == "brazil"
    assert slugify("United States") == "united-states"


def test_slugify_strips_accents_and_punctuation():
    assert slugify("Côte d'Ivoire") == "cote-d-ivoire"
    assert slugify("São Tomé and Príncipe") == "sao-tome-and-principe"


def test_assemble_ranks_by_rating_desc():
    matches = [Match("2000-01-01", "A", "B", 3, 0),
               Match("2000-01-02", "A", "C", 1, 0)]
    ratings, history = compute(matches)
    site = assemble(ratings, history, matches, k=32, initial=1500, generated_at="2000-01-03")
    ranks = [r["team"] for r in site["rankings"]]
    assert ranks[0] == "A"
    assert site["rankings"][0]["rank"] == 1
    assert site["meta"]["match_count"] == 2
    assert site["meta"]["team_count"] == 3
    assert site["meta"]["date_range"] == ["2000-01-01", "2000-01-02"]


def test_assemble_peak_and_last_match():
    matches = [Match("2000-01-01", "A", "B", 1, 0),
               Match("2000-06-01", "A", "C", 0, 1)]
    ratings, history = compute(matches)
    site = assemble(ratings, history, matches, k=32, initial=1500, generated_at="2000-06-02")
    a = next(r for r in site["rankings"] if r["team"] == "A")
    assert a["matches"] == 2
    assert a["last_match"] == "2000-06-01"
    assert a["peak"] == 1516.0            # peaked after match 1
    assert a["peak_date"] == "2000-01-01"


def test_assemble_unique_slugs_on_collision():
    matches = [Match("2000-01-01", "Sao Tome", "São Tomé", 1, 0)]
    ratings, history = compute(matches)
    site = assemble(ratings, history, matches, k=32, initial=1500, generated_at="2000-01-02")
    slugs = [r["slug"] for r in site["rankings"]]
    assert len(set(slugs)) == 2
    assert set(site["teams"].keys()) == set(slugs)
