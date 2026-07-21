#!/usr/bin/env bash
# Start real Gmail IMAP bridge for the workspace
DIR="$(cd "$(dirname "$0")" && pwd)"
PY="${HOME}/.melani_health/app/.venv/bin/python"
if [[ ! -x "$PY" ]]; then
  PY="$(command -v python3)"
fi
# free old process on 8790
kill -9 $(lsof -ti :8790) 2>/dev/null || true
cd "$DIR"
exec "$PY" gmail_api.py
