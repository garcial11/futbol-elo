import json
from elo.site_data import write_site_data


SITE = {
    "meta": {"generated_at": "2000-01-03", "k": 32, "initial_rating": 1500,
             "match_count": 1, "team_count": 2, "date_range": ["2000-01-01", "2000-01-01"]},
    "rankings": [{"rank": 1, "team": "A", "slug": "a", "rating": 1516.0,
                  "matches": 1, "last_match": "2000-01-01", "peak": 1516.0, "peak_date": "2000-01-01"}],
    "teams": {"a": {"team": "A", "slug": "a", "history": [
        {"date": "2000-01-01", "rating": 1516.0, "opponent": "B", "result": "W", "score": "1-0"}]}},
}


def test_writes_all_files(tmp_path):
    write_site_data(SITE, tmp_path)
    meta = json.loads((tmp_path / "meta.json").read_text())
    assert meta["k"] == 32
    rankings = json.loads((tmp_path / "rankings.json").read_text())
    assert rankings[0]["team"] == "A"
    team = json.loads((tmp_path / "teams" / "a.json").read_text())
    assert team["history"][0]["result"] == "W"


def test_clears_stale_team_files(tmp_path):
    (tmp_path / "teams").mkdir()
    (tmp_path / "teams" / "old.json").write_text("{}")
    write_site_data(SITE, tmp_path)
    assert not (tmp_path / "teams" / "old.json").exists()
    assert (tmp_path / "teams" / "a.json").exists()
