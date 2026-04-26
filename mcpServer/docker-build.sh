#!/usr/bin/env bash
set -e

ENV_FILE="$(dirname "$0")/.env"
PORT=3001

if [ -f "$ENV_FILE" ]; then
  PARSED=$(grep -E '^MCP_SSE_PORT=' "$ENV_FILE" | cut -d= -f2 | tr -d '[:space:]')
  [ -n "$PARSED" ] && PORT="$PARSED"
fi

docker build --build-arg PORT="$PORT" "$@" "$(dirname "$0")"
