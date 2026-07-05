import json
from pathlib import Path
import pytest
from elo.pipeline import run_update, format_summary
from elo import cli

FIXTURE = Path(__file__).parent / "fixtures" / "mini_results.csv"


def test_run_update_writes_expected_ranking(tmp_path):
    site = run_update(FIXTURE, tmp_path, k=32, generated_at="2000-01-04")
    # Aland lost to Brazil (1484); Brazil then drew Argentina.
    names = [r["team"] for r in site["rankings"]]
    assert names == ["Brazil", "Argentina", "Aland"]
    assert site["rankings"][2]["rating"] == pytest.approx(1484.0)
    assert site["meta"]["match_count"] == 2          # 3rd row skipped (no score)
    assert site["meta"]["date_range"] == ["2000-01-01", "2000-01-02"]
    # files landed on disk
    assert json.loads((tmp_path / "meta.json").read_text())["team_count"] == 3
    assert (tmp_path / "teams" / "brazil.json").exists()


def test_format_summary_mentions_top_team(tmp_path):
    site = run_update(FIXTURE, tmp_path, k=32, generated_at="2000-01-04")
    text = format_summary(site)
    assert "Brazil" in text
    assert "2 matches" in text


def test_cli_update_no_fetch_no_push(tmp_path, monkeypatch, capsys):
    monkeypatch.chdir(tmp_path)
    # place the fixture where --no-fetch expects the cache
    cache = tmp_path / "data" / "raw" / "results.csv"
    cache.parent.mkdir(parents=True)
    cache.write_text(FIXTURE.read_text())
    rc = cli.main(["update", "--no-fetch", "--no-push"])
    assert rc == 0
    assert (tmp_path / "docs" / "data" / "rankings.json").exists()
    assert "Brazil" in capsys.readouterr().out
