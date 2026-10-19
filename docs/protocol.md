# Protocol reference

Job Search MCP uses JSON-RPC 2.0 over HTTP `POST`.

## Endpoint and headers

Hosted endpoint:

```text
https://hiddenjobs.dev/mcp
```

Headers for authenticated tool calls:

```http
Accept: application/json, text/event-stream
Content-Type: application/json
Authorization: Bearer <oauth-access-token>
```

For account connections, your MCP client manages sign-in and supplies the access token.
Initialization and tool discovery are available without signing in; tool calls require access.

## Connection discovery

Your MCP client discovers connection settings automatically. Custom clients can read the resource
metadata at:

```text
https://hiddenjobs.dev/.well-known/oauth-protected-resource/mcp
```

Authentication failures return HTTP `401` with a `WWW-Authenticate` challenge pointing to these
settings. Follow the advertised endpoints instead of hardcoding them. The connection's identity
scope is `email`.

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
      },
      "resources": { "subscribe": false, "listChanged": false },
      "prompts": { "listChanged": false }
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

The full catalogue contains 45 tools with their JSON schemas. See the
[tool reference](tool-reference.md). Deployment operators can configure a reduced job-only
catalogue; clients must use discovery rather than assuming a fixed tool list.

## Call a tool

```json
{
  "jsonrpc": "2.0",
  "id": 3,
  "method": "tools/call",
  "params": {
    "name": "search_jobs",
    "arguments": {
      "sources": ["hiddenjobs"],
      "query": "typescript",
      "limit": 10
    }
  }
}
```

Successful calls return a JSON-RPC result with `isError: false`, a text content item containing the
JSON payload, and the same payload in `structuredContent`.

Tool failures return `isError: true`. The readable message is in `content[0].text`.
`structuredContent` includes an error code and status. Except for authentication challenges, tool
errors are carried in an HTTP `200` JSON-RPC result; inspect `isError` and the embedded status.

## Resources and prompts

| Method                     | Purpose                                                 | Authentication                                           |
| -------------------------- | ------------------------------------------------------- | -------------------------------------------------------- |
| `resources/list`           | List 15 workflows, four guides and three text templates | Public guidance                                          |
| `resources/templates/list` | Discover four private URI patterns                      | No private records listed                                |
| `resources/read`           | Read the specified shared or private resource           | Private records need active OAuth for the owning account |
| `prompts/list`             | List the 15 named workflow prompts                      | Public instructions                                      |
| `prompts/get`              | Get a workflow as a user message                        | Public instructions                                      |

For example:

```json
{
  "jsonrpc": "2.0",
  "id": 4,
  "method": "resources/read",
  "params": { "uri": "hiddenjobs://workflows/apply" }
}
```

```json
{ "jsonrpc": "2.0", "id": 5, "method": "prompts/get", "params": { "name": "apply" } }
```

Resource reads return `contents`, each with `uri`, `mimeType` and text. Prompt results contain
`messages`. Private resources use the same account checks as tools. If the client has no
resource/prompt interface, `get_workflow` returns identical workflow instructions and the list/get
tools retrieve private records.

The catalogue, exact URI patterns and prompt names are documented in
[resources and prompts](resources.md). A reduced deployment advertises only the capabilities it
enables; unsupported methods return a method-not-found error.

## File transfer and limits

JSON-RPC bodies are limited to 16 KiB. Original document files are limited to 2 MiB and 20 PDF
pages. Transfer the actual file via a signed upload URL, allowlisted client download reference, or
chunks of at most 8192 decoded bytes. File transfer is explicit; a path or attachment mentioned in a
chat is not a file upload. See the [workspace guide](career-workspace.md#cv-and-document-transfer).

## Notifications and errors

Messages whose method starts with `notifications/` receive HTTP `202` with no response body. Invalid
JSON-RPC requests receive a JSON-RPC error object with the standard `-32600` code. Unknown methods
receive `-32601`. Missing tool names receive `-32602`.

## Direct cURL check

Requires cURL installed in your terminal.

The following checks tool discovery on the OAuth endpoint without credentials. For authenticated
tool calls, complete login in your MCP client; this command does not perform OAuth:

```bash
curl -X POST https://hiddenjobs.dev/mcp \
  -H "Accept: application/json, text/event-stream" \
  -H "Content-Type: application/json" \
  --data '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'
```
