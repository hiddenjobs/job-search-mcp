# Protocol reference

Remote Jobs MCP uses JSON-RPC 2.0 over HTTP `POST`.

## Endpoint and headers

Hosted endpoint:

```text
https://hiddenjobs.dev/mcp
```

API-key alternative: `https://api.hiddenjobs.dev/mcp`. The JSON-RPC tool names and arguments are shared; authentication and quotas are separate.

Required request headers:

```http
Accept: application/json, text/event-stream
Content-Type: application/json
Authorization: Bearer <oauth-access-token>
```

For account connections, your MCP client manages sign-in and supplies the access
token. For API-key connections, use the key's bearer header. Initialization and
tool discovery are available without signing in; tool calls require access.

## Connection discovery

OAuth-capable clients discover connection settings automatically. Custom clients
can read the resource metadata at:

```text
https://hiddenjobs.dev/.well-known/oauth-protected-resource/mcp
```

Authentication failures return HTTP `401` with a `WWW-Authenticate` challenge
pointing to these settings. Follow the advertised endpoints instead of hardcoding
them. The account connection's identity scope is `email`; API-key scope names
apply only to API-key connections.

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
      "name": "hidden-jobs-mcp-oauth",
      "version": "2.0.0"
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

The following checks tool discovery on the OAuth endpoint without credentials. For authenticated tool calls, use an OAuth-capable client to complete login; this command does not perform OAuth:

```bash
curl -X POST https://hiddenjobs.dev/mcp \
  -H "Accept: application/json, text/event-stream" \
  -H "Content-Type: application/json" \
  --data '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'
```
