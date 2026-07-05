import subprocess
from pathlib import Path
import pytest
from elo.deploy import deploy


def _git(cwd, *args):
    subprocess.run(["git", *args], cwd=cwd, check=True,
                   capture_output=True, text=True)


def _repo(tmp_path):
    _git(tmp_path, "init", "-q")
    _git(tmp_path, "config", "user.email", "t@t.co")
    _git(tmp_path, "config", "user.name", "t")
    return tmp_path


def test_commits_changes_no_push(tmp_path):
    repo = _repo(tmp_path)
    (repo / "f.txt").write_text("hi")
    made = deploy(paths=("f.txt",), message="c1", push=False, cwd=repo)
    assert made is True
    log = subprocess.run(["git", "log", "--oneline"], cwd=repo,
                         capture_output=True, text=True).stdout
    assert "c1" in log


def test_no_changes_returns_false(tmp_path):
    repo = _repo(tmp_path)
    (repo / "f.txt").write_text("hi")
    deploy(paths=("f.txt",), message="c1", push=False, cwd=repo)
    made = deploy(paths=("f.txt",), message="c2", push=False, cwd=repo)
    assert made is False


def test_push_invoked_when_requested(tmp_path):
    calls = []

    def runner(args, **kw):
        calls.append(args)
        class R:  # noqa: N801
            returncode = 0
            stdout = "M f.txt" if args[:2] == ["git", "status"] else ""
        return R()

    made = deploy(paths=("f.txt",), message="c", push=True, runner=runner)
    assert made is True
    assert ["git", "push"] in calls
