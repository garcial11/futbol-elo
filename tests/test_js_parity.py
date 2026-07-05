"""Parity: the in-browser JS engine (docs/assets/engine.js) must produce the
same output as the Python reference. Runs engine.js via Node; skips if no Node."""
import json
import shutil
import subprocess
from pathlib import Path

import pytest

from elo.pipeline import assemble, load_matches, slugify
from elo.ratings import DEFAULT_K, INITIAL_RATING, compute

ROOT = Path(__file__).parent.parent
ENGINE = ROOT / "docs" / "assets" / "engine.js"
FIXTURE = Path(__file__).parent / "fixtures" / "mini_results.csv"

# Tricky names to exercise slugify (accents, cedillas, undecomposable letters, punctuation).
NAMES = ["Curaçao", "Côte d'Ivoire", "São Tomé and Príncipe", "Guinea-Bissau",
         "Åland", "Bosnia and Herzegovina", "St. Kitts and Nevis", "Türkiye"]

pytestmark = pytest.mark.skipif(shutil.which("node") is None, reason="node not installed")


def _run_js():
    script = (
        f"const e = require({json.dumps(str(ENGINE))});\n"
        f"const fs = require('fs');\n"
        f"const text = fs.readFileSync({json.dumps(str(FIXTURE))}, 'utf8');\n"
        f"const site = e.computeSite(e.buildMatches(e.parseCSV(text)));\n"
        f"const slugs = {json.dumps(NAMES)}.map(n => e.slugify(n));\n"
        f"process.stdout.write(JSON.stringify({{rankings: site.rankings, slugs}}));\n"
    )
    out = subprocess.run(["node", "-e", script], capture_output=True, text=True, check=True)
    return json.loads(out.stdout)


def _py_rankings():
    matches = load_matches(FIXTURE)
    ratings, history = compute(matches, k=DEFAULT_K)
    site = assemble(ratings, history, matches, k=DEFAULT_K,
                    initial=INITIAL_RATING, generated_at="x")
    return site["rankings"]


def test_js_rankings_match_python():
    js = _run_js()["rankings"]
    py = _py_rankings()
    assert len(js) == len(py)
    for j, p in zip(js, py):
        for key in ("rank", "team", "slug", "matches", "last_match", "peak_date"):
            assert j[key] == p[key], f"{key}: {j[key]!r} != {p[key]!r}"
        assert j["rating"] == pytest.approx(p["rating"])
        assert j["peak"] == pytest.approx(p["peak"])


def test_js_slugify_matches_python():
    js_slugs = _run_js()["slugs"]
    assert js_slugs == [slugify(n) for n in NAMES]
