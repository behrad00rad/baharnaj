#!/usr/bin/env sh

set -eu

PROJECT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
BACKEND_DIR="$PROJECT_DIR/backend"

if [ -x "$BACKEND_DIR/.venv312/bin/python" ]; then
    PYTHON="$BACKEND_DIR/.venv312/bin/python"
elif [ -x "$BACKEND_DIR/.venv/bin/python" ] && "$BACKEND_DIR/.venv/bin/python" -c 'import sys; raise SystemExit(sys.version_info >= (3, 13))'; then
    PYTHON="$BACKEND_DIR/.venv/bin/python"
else
    PYTHON=python3.12
fi

cd "$BACKEND_DIR"
"$PYTHON" manage.py migrate
exec "$PYTHON" manage.py runserver 0.0.0.0:8000