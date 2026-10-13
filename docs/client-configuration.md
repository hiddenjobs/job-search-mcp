# Client configuration

## Account OAuth (recommended)

```text
Name: Hidden Jobs
URL: https://hiddenjobs.dev/mcp
Authentication: OAuth
```

Add a custom remote MCP server in your client, enter this URL, then sign in to
Hidden Jobs and approve the connection. No API key is needed for account sign-in.

Example prompt: “Find remote backend jobs in Europe, compare three offers and
show the application link for the best match.” Links require active Access for
the connected account.

### ChatGPT

In ChatGPT's custom MCP connection interface, enter the account URL and choose
OAuth. Complete the Hidden Jobs sign-in and connection approval. Labels and custom-server availability depend on
your account and workspace. See [official connection guidance](https://developers.openai.com/api/docs/mcp).

### Other AI clients

Use the same URL with a client that supports remote HTTP MCP and OAuth. Follow
its current remote-server setup instructions; a remote connector may use a
different configuration from local servers.

For clients supporting JSON URL entries, the starting configuration is:

```json
{
  "mcpServers": {
    "hidden-jobs": { "url": "https://hiddenjobs.dev/mcp" }
  }
}
```

See [generic OAuth example](../examples/oauth-connection.md) and [official Cursor URL configuration](https://prod.cursor.com/help/customization/mcp).

## API-key alternative

For clients supporting URL entries and custom headers, use the separate endpoint
`https://api.hiddenjobs.dev/mcp` and an API key from the
[dashboard](https://hiddenjobs.dev/dashboard/api-keys). Example:

```json
{
  "mcpServers": {
    "hidden-jobs-api-key": {
      "url": "https://api.hiddenjobs.dev/mcp",
      "headers": { "Authorization": "Bearer hj_live_..." }
    }
  }
}
```

See [API-key example](../examples/api-key-client.json). Use a client secret store
or a local untracked configuration for actual keys. `jobs:read` covers search
and detail; `application-links:read` plus the key owner's Access covers links.
These are API-key scopes, not OAuth scopes.

## Troubleshooting

| Symptom | Action |
| --- | --- |
| OAuth discovery fails | Use `https://hiddenjobs.dev/mcp`, not the API-key endpoint |
| Consent or authorization expired | Restart linking from the AI client |
| OAuth `401` | Reconnect your account; do not paste an API key into OAuth |
| Application-link `402` | Check Access for the connected account |
| API-key `403` | Check key scopes and whether the key is paused |
| `429` | Wait; OAuth account limits and API-key quotas are separate |

Reconnect a connection that has expired or stopped working. Agents should
search, inspect details and request the application link when asked to apply.
Never reveal credentials in responses, logs or generated files.
