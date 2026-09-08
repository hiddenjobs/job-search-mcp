# Deployment

There are two supported ways to use Hidden Jobs MCP.

## Use the hosted endpoint

This is the recommended path for client integrations:

```text
https://api.hiddenjobs.dev/mcp
```

Create a key at [hiddenjobs.dev/dashboard/api-keys](https://hiddenjobs.dev/dashboard/api-keys), configure it in the MCP client, and no server deployment is required.

## Deploy your own Supabase Edge Function

This repository contains a self-contained Supabase Edge Function and the minimal project configuration required to deploy it.

### Prerequisites

- Supabase CLI installed and authenticated
- A Supabase project
- A Hidden Jobs API key for requests from the client
- Access to the Hidden Jobs REST API

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

The `--no-verify-jwt` flag is intentional. This function authenticates the Hidden Jobs API bearer token itself. Requiring a Supabase Auth JWT at the gateway would reject valid MCP clients before the function can forward their bearer token.

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
