"""Serialize assembled site data to the JSON files the website reads."""
from __future__ import annotations

import hashlib
import json
import re
from pathlib import Path

# Assets whose URL gets a ?v=<hash> so a new index.html can never be paired
# with a stale, browser-cached copy of them.
_VERSIONED_ASSETS = ("assets/app.js", "assets/style.css")


def write_site_data(site: dict, out_dir: str | Path) -> None:
    out = Path(out_dir)
    teams_dir = out / "teams"
    teams_dir.mkdir(parents=True, exist_ok=True)
    for stale in teams_dir.glob("*.json"):
        stale.unlink()

    (out / "meta.json").write_text(json.dumps(site["meta"], indent=2), encoding="utf-8")
    (out / "rankings.json").write_text(
        json.dumps(site["rankings"], separators=(",", ":")), encoding="utf-8")
    for slug, team in site["teams"].items():
        (teams_dir / f"{slug}.json").write_text(
            json.dumps(team, separators=(",", ":")), encoding="utf-8")

    # Consolidated (date, rating) history for every team, so the site can
    # reconstruct the ranking as of any past date from a single file.
    history = {
        slug: {"t": team["team"], "h": [[h["date"], h["rating"]] for h in team["history"]]}
        for slug, team in site["teams"].items()
    }
    (out / "history.json").write_text(
        json.dumps(history, separators=(",", ":")), encoding="utf-8")


def stamp_asset_versions(site_dir: str | Path) -> str | None:
    """Rewrite index.html so app.js/style.css carry a ?v=<hash> of their content.

    The hash only changes when an asset changes, so browsers refetch exactly
    when they must and never pair fresh HTML with a stale cached script.
    Returns the version, or None if there is no index.html to stamp.
    """
    site = Path(site_dir)
    index = site / "index.html"
    if not index.exists():
        return None

    digest = hashlib.sha256()
    for asset in _VERSIONED_ASSETS:
        path = site / asset
        if path.exists():
            digest.update(path.read_bytes())
    version = digest.hexdigest()[:8]

    html = index.read_text(encoding="utf-8")
    for asset in _VERSIONED_ASSETS:
        pattern = rf'((?:src|href)=")({re.escape(asset)})(\?v=[0-9a-f]+)?"'
        html = re.sub(pattern, rf'\1\2?v={version}"', html)
    index.write_text(html, encoding="utf-8")
    return version
