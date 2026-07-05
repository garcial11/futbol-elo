"""Stage, commit, and push generated site data."""
from __future__ import annotations

import subprocess


def deploy(paths=("docs/data",), message="Update ratings",
           push=True, cwd=None, runner=subprocess.run) -> bool:
    def run(args):
        return runner(args, cwd=cwd, capture_output=True, text=True)

    run(["git", "add", *paths])
    status = run(["git", "status", "--porcelain", "--", *paths])
    if not status.stdout.strip():
        return False
    run(["git", "commit", "-m", message])
    if push:
        run(["git", "push"])
    return True
