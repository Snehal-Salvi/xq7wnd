"""Deployment config stays consistent: Docker installs requirements.txt, Vercel reads pyproject.toml."""

import tomllib
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def test_pyproject_dependencies_match_requirements_txt():
    pyproject = tomllib.loads((ROOT / "pyproject.toml").read_text())
    requirements = [
        line.strip()
        for line in (ROOT / "requirements.txt").read_text().splitlines()
        if line.strip() and not line.startswith("#")
    ]
    assert pyproject["project"]["dependencies"] == requirements


def test_vercel_entrypoint_points_at_the_app():
    pyproject = tomllib.loads((ROOT / "pyproject.toml").read_text())
    module, attr = pyproject["tool"]["vercel"]["entrypoint"].split(":")
    assert (ROOT / (module.replace(".", "/") + ".py")).exists()
    assert attr == "app"
