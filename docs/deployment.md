# Development

## Use the hosted server

For normal use, no server deployment is required. Add
`https://hiddenjobs.dev/mcp` to your AI client, choose OAuth and connect your
Hidden Jobs account. For example: “Find remote backend jobs in Europe.”
See [client configuration](client-configuration.md).

## Run the included server locally

The source in this repository provides the API-key connection. Account sign-in
is available through the hosted endpoint; the included server uses a Hidden Jobs
API key and the [REST API](https://hiddenjobs.dev/api/docs).

Install Deno 2 and set the API base URL:

```bash
HIDDEN_JOBS_API_URL=https://api.hiddenjobs.dev/v1 deno task start
```

The server listens on Deno's default HTTP port. Configure your client with the
local URL and store its API key in the client's secret configuration.

Run the repository checks:

```bash
deno task fmt
deno task check
```

## Smoke test the API-key connection

Set `HIDDEN_JOBS_API_KEY` through your environment or secret manager, then run:

```bash
HIDDEN_JOBS_MCP_URL=http://localhost:8000 deno task smoke
```

The test covers initialization, tool discovery, search and job details. It does
not test account sign-in. Application-link requests are excluded unless
`CHECK_APPLICATION_LINK=true` is set.

Never commit credentials. Keep the upstream API URL trusted and use HTTPS for
remote connections. See [security guidance](../SECURITY.md).
