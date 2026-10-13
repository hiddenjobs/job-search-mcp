# Deployment

The hosted account OAuth service and the deployable API-key adapter are distinct.
For example, choosing OAuth with `https://hiddenjobs.dev/mcp` logs into the user's
Hidden Jobs account; deploying the source below creates an API-key forwarding
adapter and does not add OAuth discovery, consent or token issuance.

## Use the hosted endpoint

This is the recommended path for client integrations:

```text
https://hiddenjobs.dev/mcp
```

Choose OAuth, sign in with your Hidden Jobs account and approve access. No user
API key and no server deployment are required. Application links use that
account's current Access subscription. See [client configuration](client-configuration.md).

The separate API-key endpoint `https://api.hiddenjobs.dev/mcp` remains available
for bearer-key clients. The source and deployment instructions below refer only
to that adapter, not the hosted account OAuth service.

The live [API reference](https://api.hiddenjobs.dev/openapi.json) documents the upstream REST resources used by this adapter.

## Deploy the API-key adapter as a Supabase Edge Function

This repository contains a self-contained API-key adapter and the minimal project configuration required to deploy it. Enabling Supabase OAuth Server alone does not make this adapter OAuth-capable; a separate resource server, discovery, consent and validation implementation is needed.

### Prerequisites

- Supabase CLI installed and authenticated
- A Supabase project
- An access key for requests from the client
- Access to the job-search REST API

### Configure the project

Link the local directory to your Supabase project:

```bash
supabase login
supabase link --project-ref <your-project-ref>
```

The function reads these environment variables:

| Variable | Required | Description |
| --- | --- | --- |
| `HIDDEN_JOBS_API_URL` | Recommended | REST API base URL, for example `https://api.hiddenjobs.dev/v1` |
| `SUPABASE_URL` | Runtime | Supabase injects this when the function runs |
| `SUPABASE_ANON_KEY` | Optional | Forwarded as the upstream `apikey` header when set |

When `HIDDEN_JOBS_API_URL` is absent, the function falls back to `${SUPABASE_URL}/functions/v1/api-v1`. Set the explicit URL when the API is hosted elsewhere.

### Deploy the function

```bash
supabase functions deploy hidden-jobs-mcp --no-verify-jwt
supabase secrets set HIDDEN_JOBS_API_URL=https://api.hiddenjobs.dev/v1
```

The `--no-verify-jwt` flag is intentional. This function authenticates the job-search API bearer token itself. Requiring a Supabase Auth JWT at the gateway would reject valid MCP clients before the function can forward their bearer token.

The resulting URL is:

```text
https://<your-project-ref>.supabase.co/functions/v1/hidden-jobs-mcp
```

Use that URL in the client instead of the hosted URL.

### Local development

Run the function with Deno:

```bash
HIDDEN_JOBS_API_URL=https://api.hiddenjobs.dev/v1 SUPABASE_ANON_KEY=<supabase-anon-key> deno task start
```

The local server uses Deno's default HTTP port. Set `HIDDEN_JOBS_MCP_URL` to the actual local URL when running the smoke test.

### Deployment checklist

- Confirm `verify_jwt = false` for the MCP function
- Set `HIDDEN_JOBS_API_URL` to a trusted HTTPS API origin
- Never set a service-role key in an MCP client
- Keep API keys out of the repository and CI logs
- Test `initialize`, `tools/list`, and an authenticated `search_jobs` call
- Test the subscription-required path for `open_application_link`
