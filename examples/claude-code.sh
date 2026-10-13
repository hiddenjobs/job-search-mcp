#!/usr/bin/env bash
set -euo pipefail
claude mcp add --transport http hidden-jobs https://hiddenjobs.dev/mcp
claude mcp login hidden-jobs
