#!/usr/bin/env bash
set -euo pipefail

: "${HIDDEN_JOBS_API_KEY:?Set HIDDEN_JOBS_API_KEY in the environment}"

curl --fail-with-body --silent --show-error \
  --request POST \
  --url "${HIDDEN_JOBS_MCP_URL:-https://api.hiddenjobs.dev/mcp}" \
  --header 'Accept: application/json, text/event-stream' \
  --header 'Content-Type: application/json' \
  --header "Authorization: Bearer ${HIDDEN_JOBS_API_KEY}" \
  --data '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'
