# Protocol reference

Remote Jobs MCP uses JSON-RPC 2.0 over HTTP `POST`.

## Endpoint and headers

Hosted endpoint:

```text
https://api.hiddenjobs.dev/mcp
```

Required request headers:

```http
Accept: application/json, text/event-stream
Content-Type: application/json
Authorization: Bearer hj_live_...
```

The authorization header is required for tool calls. The handshake methods are available without authentication so clients can discover the server, but data tools still enforce API key access through the underlying REST API.

## Initialize

Request:

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "initialize",
  "params": {
    "protocolVersion": "2025-06-18",
    "capabilities": {},
    "clientInfo": {
      "name": "example-client",
      "version": "1.0.0"
    }
  }
}
```

Response:

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "protocolVersion": "2025-06-18",
    "capabilities": {
      "tools": {
        "listChanged": false
      }
    },
    "serverInfo": {
      "name": "remote-jobs-mcp",
      "version": "1.0.0"
    }
  }
}
```

## List tools

```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "method": "tools/list",
  "params": {}
}
```

The result contains `search_jobs`, `get_job`, and `open_application_link` with their JSON schemas.

## Call a tool

```json
{
  "jsonrpc": "2.0",
  "id": 3,
  "method": "tools/call",
  "params": {
    "name": "search_jobs",
    "arguments": {
      "query": "typescript",
      "limit": 10
    }
  }
}
```

Successful calls return a JSON-RPC result with `isError: false`, a text content item containing the JSON API payload, and the same payload in `structuredContent`.

Tool failures return `isError: true`. The readable message is in `content[0].text`. When the failure comes from the REST API, `structuredContent` includes the API error code and HTTP status.

## Notifications and errors

Messages whose method starts with `notifications/` receive HTTP `202` with no response body. Invalid JSON-RPC requests receive a JSON-RPC error object with the standard `-32600` code. Unknown methods receive `-32601`. Missing tool names receive `-32602`.

## Direct cURL check

The following uses an environment variable so the key does not appear in shell history or source code:

```bash
curl -X POST https://api.hiddenjobs.dev/mcp \
  -H "Accept: application/json, text/event-stream" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${HIDDEN_JOBS_API_KEY}" \
  --data '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'
```
