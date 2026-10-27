#!/usr/bin/env bash
# One-command local run for macOS/Linux: sets up and starts the backend (:8000)
# and frontend (:5173). Press Ctrl+C to stop both.
#
#   ./start.sh
set -euo pipefail
cd "$(dirname "$0")"

VENV=backend/.venv
# Allow slow connections to finish downloading package indexes (uv's default is 30s).
export UV_HTTP_TIMEOUT="${UV_HTTP_TIMEOUT:-300}"
export PIP_DEFAULT_TIMEOUT="${PIP_DEFAULT_TIMEOUT:-300}"
is_312_plus() { "$1" -c 'import sys; sys.exit(sys.version_info < (3, 12))' 2>/dev/null; }

# --- Backend: a Python 3.12+ virtual environment -----------------------------
if [ ! -x "$VENV/bin/python" ] || ! is_312_plus "$VENV/bin/python"; then
  rm -rf "$VENV"
  if command -v uv >/dev/null 2>&1; then
    echo "Creating Python 3.13 environment with uv..."
    uv venv --python 3.13 "$VENV"
  else
    PY=""
    for candidate in python3.14 python3.13 python3.12 python3; do
      if command -v "$candidate" >/dev/null 2>&1 && is_312_plus "$candidate"; then PY="$candidate"; break; fi
    done
    if [ -z "$PY" ]; then
      cat <<'MSG'

This project needs Python 3.12 or newer, and none was found.
The quickest fix (no admin rights needed) is to install uv, then run this script again:

    curl -LsSf https://astral.sh/uv/install.sh | sh
    export PATH="$HOME/.local/bin:$PATH"
    ./start.sh

MSG
      exit 1
    fi
    echo "Creating environment with $($PY --version)..."
    "$PY" -m venv "$VENV"
  fi
fi

# Packages come from PyPI, or from backend/wheels/ when present (offline / slow networks).
SOURCE=()
if compgen -G "backend/wheels/*.whl" >/dev/null; then
  SOURCE=(--no-index --find-links backend/wheels)
  echo "Installing backend dependencies from backend/wheels..."
else
  echo "Installing backend dependencies..."
fi
if command -v uv >/dev/null 2>&1; then
  uv pip install --quiet --python "$VENV/bin/python" "${SOURCE[@]}" -r backend/requirements-dev.txt
else
  "$VENV/bin/python" -m pip install --quiet "${SOURCE[@]}" -r backend/requirements-dev.txt
fi

# --- Frontend -----------------------------------------------------------------
if ! command -v npm >/dev/null 2>&1; then
  echo "Node.js 22+ is required for the frontend: https://nodejs.org" && exit 1
fi
if [ ! -d frontend/node_modules ]; then
  echo "Installing frontend dependencies..."
  (cd frontend && npm ci --no-audit --no-fund)
fi

# --- Run both, stop both on Ctrl+C --------------------------------------------
cleanup() { kill 0 2>/dev/null || true; }
trap cleanup EXIT INT TERM

(cd backend && .venv/bin/uvicorn app.main:app --reload --port 8000) &
(cd frontend && npm run dev -- --port 5173 --strictPort) &

echo
echo "Starting... open http://localhost:5173 (API docs: http://localhost:8000/docs)"
echo "The first page load takes a few seconds while January's data is fetched from Elexon."
echo "Press Ctrl+C to stop."
wait
