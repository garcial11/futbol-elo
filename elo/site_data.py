"""Serialize assembled site data to the JSON files the website reads."""
from __future__ import annotations

import json
from pathlib import Path


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
