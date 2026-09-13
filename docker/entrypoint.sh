#!/bin/sh
set -eu

chown -R appuser:appuser /app/var
cd /app/backend
runuser -u appuser -- python -m app.cli
exec runuser -u appuser -- uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-8000}"
