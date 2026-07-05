"""Stage, commit, and push generated site data."""
from __future__ import annotations

import subprocess


def deploy(paths=("docs/data",), message="Update ratings",
           push=True, cwd=None, runner=subprocess.run) -> bool:
    def run(args, check=False):
        result = runner(args, cwd=cwd, capture_output=True, text=True)
        if check and result.returncode != 0:
            raise RuntimeError(f"{' '.join(args)} failed: {result.stderr or result.stdout}")
        return result

    run(["git", "add", *paths])
    status = run(["git", "status", "--porcelain", "--", *paths])
    if not status.stdout.strip():
        return False
    run(["git", "commit", "-m", message], check=True)
    if push:
        run(["git", "push"], check=True)
    return True
