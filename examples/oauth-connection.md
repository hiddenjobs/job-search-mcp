# Account OAuth connection

```text
Name: Hidden Jobs
URL: https://hiddenjobs.dev/mcp
Authentication: OAuth
```

Sign in with your existing Hidden Jobs account and approve access. Do not add an
API-key header. Example prompt: “Find remote TypeScript jobs in Europe.”

The [Cursor URL example](cursor.json) is for clients supporting JSON URL entries;
use each provider's current remote MCP setup interface. A remote connector is
not necessarily configured in a desktop stdio JSON file. Check compatibility
with HTTPS or HTTP loopback callback URLs before promising a provider works.

For clients that need a bearer key, use [the separate API-key example](api-key-client.json).
