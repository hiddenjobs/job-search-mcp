# Remote Jobs MCP client configuration

The hosted server works with MCP clients that support a remote HTTP server. Use the same endpoint and bearer header in every client:

```text
URL: https://api.hiddenjobs.dev/mcp
Header: Authorization: Bearer hj_live_...
```

Never put the real key in a committed JSON file. Use the client's secret store, environment-variable interpolation, or a local untracked configuration file.

## Claude Desktop

Add the following server entry to Claude Desktop's configuration file. The file location depends on the operating system. Replace the placeholder locally.

```json
{
  "mcpServers": {
    "remote-jobs": {
      "url": "https://api.hiddenjobs.dev/mcp",
      "headers": {
        "Authorization": "Bearer hj_live_..."
      }
    }
  }
}
```

See [`examples/claude-desktop.json`](../examples/claude-desktop.json).

## Cursor

Add the server to the Cursor MCP configuration:

```json
{
  "mcpServers": {
    "remote-jobs": {
      "url": "https://api.hiddenjobs.dev/mcp",
      "headers": {
        "Authorization": "Bearer hj_live_..."
      }
    }
  }
}
```

See [`examples/cursor.json`](../examples/cursor.json).

## Generic clients

Configure a remote Streamable HTTP MCP server with:

1. The URL `https://api.hiddenjobs.dev/mcp`
2. An `Authorization` header containing the job-search API bearer key
3. `Accept: application/json, text/event-stream` when the client allows custom headers
4. JSON-RPC 2.0 requests sent with HTTP `POST`

Most clients handle `initialize`, `tools/list`, and protocol details automatically.

## Recommended agent behaviour

An agent should:

1. Call `search_jobs` to discover matching offers
2. Call `get_job` to inspect descriptions and metadata
3. Call `open_application_link` only when the user asks for the original application URL
4. Treat a `402 subscription_required` result as a subscription prompt rather than a server failure
5. Never expose the bearer token in a response, log, transcript, or generated file
