# Connection verification

Add `https://hiddenjobs.dev/mcp` to your MCP client and complete account sign-in.
No server deployment is required to use the hosted service.

## Check your terminal client

```bash
claude mcp get hidden-jobs
```

Or, with Codex:

```bash
codex mcp list
```

Start your client and ask: “Search Hidden Jobs for remote backend roles in Europe.”
Then inspect a result with `get_job`. To test an application link, use an account
with active Hidden Jobs Access and request `open_application_link` for that role.

## Check tool discovery

Requires cURL 7.76 or later.

```bash
curl --fail-with-body --silent --show-error \
  --request POST https://hiddenjobs.dev/mcp \
  --header 'Content-Type: application/json' \
  --header 'Accept: application/json, text/event-stream' \
  --data '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'
```

This checks discovery. Complete account sign-in in your client before calling
tools. See [client configuration](client-configuration.md) for connection help.
