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

# Names that exercise slugify. The first row is regression cover: every one of them decomposes
# under NFKD, so both the Python and the JS implementation have always agreed on them. They cannot
# fail. They are also, for that reason, the reason the original version of this test was useless.
#
# The second row is the part that discriminates. The letters đ ø ł æ have no NFKD decomposition,
# so the old JS slugify (which only stripped combining marks) left them in place and turned them
# into hyphens, while Python dropped them. Position matters and it is the whole trick: the letter
# has to sit INSIDE the word. At the start or the end the stray hyphen is trimmed off again and
# both implementations agree anyway, which is why "Tromsø", "Łódź" and "Ærø" look tricky and
# discriminate nothing. "Đorđe" slugs to "or-e" under the old JS and "ore" under Python.
#
# Adding a fixture that cannot fail is the same mistake twice. See HOW-THIS-WAS-BUILT.md.
NAMES = ["Curaçao", "Côte d'Ivoire", "São Tomé and Príncipe", "Guinea-Bissau",
         "Åland", "Bosnia and Herzegovina", "St. Kitts and Nevis", "Türkiye",
         "Đorđe", "Bjørn", "Wisła", "Sæby"]

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
