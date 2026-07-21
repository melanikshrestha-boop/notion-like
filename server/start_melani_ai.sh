#!/usr/bin/env bash
# Start Melani AI (Grok) bridge on :8791
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
# Prefer Melani health venv (already has fastapi/uvicorn)
VENV_PY="${HOME}/.melani_health/app/.venv/bin/python"
if [[ ! -x "$VENV_PY" ]]; then
  VENV_PY="$(command -v python3)"
fi
# Load key from file into env if not already set
KEY_FILE="${HOME}/.melani_assistant/xai_api_key"
if [[ -z "${XAI_API_KEY:-}" && -f "$KEY_FILE" ]]; then
  export XAI_API_KEY="$(tr -d ' \n\r' < "$KEY_FILE")"
fi
# free port if leftover process
if command -v lsof >/dev/null 2>&1; then
  kill -9 $(lsof -ti :8791) 2>/dev/null || true
fi
cd "$ROOT"
exec "$VENV_PY" melani_ai.py
