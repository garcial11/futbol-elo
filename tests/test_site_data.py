import json
from elo.site_data import write_site_data, stamp_asset_versions


def _site_with_assets(tmp_path):
    (tmp_path / "assets").mkdir()
    (tmp_path / "assets" / "app.js").write_text("console.log(1)")
    (tmp_path / "assets" / "style.css").write_text("body{margin:0}")
    (tmp_path / "index.html").write_text(
        '<link rel="stylesheet" href="assets/style.css">\n'
        '<script src="assets/app.js"></script>')
    return tmp_path


def test_stamp_adds_version_query(tmp_path):
    site = _site_with_assets(tmp_path)
    version = stamp_asset_versions(site)
    html = (site / "index.html").read_text()
    assert f'href="assets/style.css?v={version}"' in html
    assert f'src="assets/app.js?v={version}"' in html


def test_stamp_is_stable_and_not_duplicated(tmp_path):
    site = _site_with_assets(tmp_path)
    v1 = stamp_asset_versions(site)
    v2 = stamp_asset_versions(site)  # unchanged assets -> same version, no double ?v=
    assert v1 == v2
    html = (site / "index.html").read_text()
    assert html.count("?v=") == 2


def test_stamp_changes_when_asset_changes(tmp_path):
    site = _site_with_assets(tmp_path)
    v1 = stamp_asset_versions(site)
    (site / "assets" / "app.js").write_text("console.log(2)  // changed")
    v2 = stamp_asset_versions(site)
    assert v1 != v2


def test_stamp_no_index_is_noop(tmp_path):
    assert stamp_asset_versions(tmp_path) is None


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


def test_writes_compact_history(tmp_path):
    write_site_data(SITE, tmp_path)
    hist = json.loads((tmp_path / "history.json").read_text())
    # one entry per team, each carrying its name and [date, rating] points
    assert hist["a"]["t"] == "A"
    assert hist["a"]["h"] == [["2000-01-01", 1516.0]]
