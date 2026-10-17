# Server development and deployment

To use the hosted service, connect `https://hiddenjobs.dev/mcp` and sign in with your Hidden Jobs
account. See [client configuration](client-configuration.md).

## Run the server locally

Requires Deno 2 and an existing account and jobs backend implementing the
[backend contract](backend-contract.md). Configure a development backend before running tool calls.

```bash
cp .env.example .env
# Fill SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.
deno task start
```

The server listens on `http://127.0.0.1:8000`. For example, discover its tools:

```bash
curl --fail-with-body --silent --show-error \
  --request POST http://127.0.0.1:8000/mcp \
  --header 'Content-Type: application/json' \
  --header 'Accept: application/json, text/event-stream' \
  --data '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'
```

| Setting                     | Purpose                                                            |
| --------------------------- | ------------------------------------------------------------------ |
| `SUPABASE_URL`              | Backend project URL                                                |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-side backend credential; keep private                       |
| `SUPABASE_JOBS_TABLE`       | Jobs table, defaults to `jobs`                                     |
| `MCP_RESOURCE_URL`          | Canonical public MCP URL, defaults to `https://hiddenjobs.dev/mcp` |
| `OAUTH_ISSUER`              | Trusted issuer, defaults to `SUPABASE_URL/auth/v1`                 |
| `HOST`, `PORT`              | Local listener; defaults to `127.0.0.1:8000`                       |

Keep `.env` outside version control. The service credential is used only for backend operations.
Client access tokens are verified locally and are never forwarded to the backend as credentials.

## Deployment routing

Run `scripts/serve.ts` behind HTTPS, or use the Edge Function entry point at
`supabase/functions/hidden-jobs-mcp/index.ts`. Function gateway JWT verification is disabled in the
included configuration because the MCP server validates OAuth signatures, audience and account
access itself. Supply the same environment settings in the server runtime.

Route both the transport and its metadata to the server. For example:

```text
https://mcp.example.com/mcp
https://mcp.example.com/.well-known/oauth-protected-resource/mcp
```

Set `MCP_RESOURCE_URL=https://mcp.example.com/mcp` for that deployment. Configure the authorization
server to issue tokens for that exact audience and publish its OAuth discovery endpoints. Its JWKS
must be available at `OAUTH_ISSUER/.well-known/jwks.json`. The included resource server handles MCP
requests and protected-resource metadata; account login, client registration, consent and token
issuance belong to the existing authorization server.

Local tool discovery needs no account. To test login against a development deployment, configure its
public HTTPS resource URL, issuer, OAuth client and backend together; production tokens retain their
production audience.

## Smoke checks

Check the hosted endpoint without credentials:

```bash
deno task smoke
```

This checks initialization, schemas, OAuth resource metadata and the unauthenticated challenge. It
explicitly reports that authenticated tool calls were not run.

For an authenticated integration check, complete OAuth in your client and store a current access
token in a private file outside the repository. Then run:

```bash
HIDDEN_JOBS_OAUTH_TOKEN_FILE=/private/path/access-token.txt \
  CHECK_APPLICATION_LINK=true deno task smoke
```

This also searches, reads a returned job and verifies either an authorized application link or the
subscription-required result. Tokens and application URLs are never printed. An expired token or
empty search result fails this check. The script does not perform browser login or refresh tokens.

To check another deployment, set `HIDDEN_JOBS_MCP_URL` and `MCP_RESOURCE_URL` explicitly. The smoke
task reads its settings from the process environment; the start task loads `.env`.
