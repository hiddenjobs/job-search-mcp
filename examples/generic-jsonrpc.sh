#!/usr/bin/env bash
set -euo pipefail
# Discover tools; complete sign-in in your MCP client to call them.
curl --fail-with-body --silent --show-error \
  --request POST \
  --url "${HIDDEN_JOBS_MCP_URL:-https://hiddenjobs.dev/mcp}" \
  --header 'Accept: application/json, text/event-stream' \
  --header 'Content-Type: application/json' \
  --data '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'
