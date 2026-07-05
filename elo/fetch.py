"""Download and cache the international results dataset."""
from __future__ import annotations

import urllib.request
from pathlib import Path

DATA_URL = "https://raw.githubusercontent.com/martj42/international_results/master/results.csv"
DEFAULT_CACHE = Path("data/raw/results.csv")


def _download(url: str, dest: Path) -> None:
    with urllib.request.urlopen(url) as resp:  # noqa: S310 (trusted GitHub raw URL)
        Path(dest).write_bytes(resp.read())


def get_results(use_cache: bool = False, url: str = DATA_URL,
                cache_path: Path = DEFAULT_CACHE, downloader=_download) -> Path:
    cache_path = Path(cache_path)
    if use_cache and cache_path.exists():
        return cache_path
    cache_path.parent.mkdir(parents=True, exist_ok=True)
    downloader(url, cache_path)
    return cache_path
