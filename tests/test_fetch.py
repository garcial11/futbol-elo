from pathlib import Path
import pytest
from elo.fetch import get_results


def test_downloads_when_no_cache(tmp_path):
    dest = tmp_path / "sub" / "results.csv"
    calls = []

    def fake(url, path):
        calls.append(url)
        Path(path).write_text("data")

    out = get_results(use_cache=False, url="http://x", cache_path=dest, downloader=fake)
    assert out == dest
    assert dest.read_text() == "data"
    assert calls == ["http://x"]


def test_uses_cache_without_downloading(tmp_path):
    dest = tmp_path / "results.csv"
    dest.write_text("cached")

    def boom(url, path):
        raise AssertionError("should not download")

    out = get_results(use_cache=True, cache_path=dest, downloader=boom)
    assert out == dest
    assert dest.read_text() == "cached"
