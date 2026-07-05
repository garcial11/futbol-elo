"""Command line entry point: `python -m elo update|serve`."""
from __future__ import annotations

import argparse
import functools
import http.server
import socketserver
from datetime import date
from pathlib import Path

from elo.deploy import deploy
from elo.fetch import get_results
from elo.pipeline import format_summary, run_update
from elo.ratings import DEFAULT_K

OUT_DIR = Path("docs/data")
SITE_DIR = Path("docs")


def cmd_update(args) -> int:
    # use_cache=True returns the cached CSV when present and downloads otherwise;
    # use_cache=False always fetches fresh.
    csv_path = get_results(use_cache=args.no_fetch)
    site = run_update(csv_path, OUT_DIR, k=args.k, since=args.since,
                      generated_at=date.today().isoformat())
    print(format_summary(site))
    if args.no_push:
        return 0
    try:
        pushed = deploy(paths=(str(OUT_DIR),),
                        message=f"Update ratings {site['meta']['generated_at']}")
        print("Pushed to GitHub Pages." if pushed else "No changes to publish.")
    except Exception as exc:  # noqa: BLE001 — surface, don't crash the run
        print(f"Update computed, but git push failed: {exc}\n"
              "Configure a remote (git remote add origin ...) or use --no-push.")
    return 0


def cmd_serve(args) -> int:
    handler = functools.partial(http.server.SimpleHTTPRequestHandler,
                                directory=str(SITE_DIR))
    with socketserver.TCPServer(("", args.port), handler) as httpd:
        print(f"Serving {SITE_DIR}/ at http://localhost:{args.port} (Ctrl+C to stop)")
        httpd.serve_forever()
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="elo")
    sub = parser.add_subparsers(dest="command", required=True)

    up = sub.add_parser("update", help="fetch results, recompute ratings, publish")
    up.add_argument("--no-fetch", action="store_true", help="reuse the cached CSV")
    up.add_argument("--no-push", action="store_true", help="write files but do not push")
    up.add_argument("--k", type=float, default=DEFAULT_K, help="K-factor (default 32)")
    up.add_argument("--since", type=int, default=None, help="only matches on/after this year")
    up.set_defaults(func=cmd_update)

    sv = sub.add_parser("serve", help="preview the site locally")
    sv.add_argument("--port", type=int, default=8000)
    sv.set_defaults(func=cmd_serve)

    args = parser.parse_args(argv)
    return args.func(args)
