# MCP integration development

Connect to the hosted service at `https://hiddenjobs.dev/mcp`. Sign in with your Hidden Jobs
account; client setup requires no backend credentials. See
[client configuration](client-configuration.md).

## Repository scope

This repository maintains the MCP integration contract:

- Tool definitions, argument validation, the JSON-RPC handler and REST implementations.
- External-source API/RSS adapters, normalization, filtering, continuation and temporary caching in `src/sources/`.
- Portable skills and their corresponding prompts and workflow resources.
- Shared guides, document templates and private resource URI patterns.
- Client connection guides, connection metadata and protocol tests.

The Hidden Jobs application repository reuses a pinned copy of these adapters and maintains the hosted implementation: database migrations,
account and account access checks, private file storage, document extraction, PDF generation,
dashboards and deployment configuration.

For example, `save_cv` defines the tool arguments here. The Hidden Jobs backend stores the version,
checks ownership and preserves its history. Changing a tool schema requires coordinated changes in
both repositories; changing an internal table belongs to the application repository.

## Run the integration checks

Requires Deno 2. No database or service credential is needed.

```bash
npm ci
deno task fmt
deno task lint
deno task check
deno task test
deno task docs:check
deno task skills:check
```

The remote connector uses `createRestMcpHandler` from `src/index.ts`. It forwards each tool
operation to the REST endpoint defined in `src/api/routes.ts`, using `src/api/client.ts` and the
original account OAuth access token. There is no local database or backend service credential.

For example, `save_cv` sends `POST /me/cvs`. Private resources use the same REST operations; shared
instructions, guides and templates are read directly from this integration. Discovery does not
contact the API. See the [adapter contract](rest-adapter.md).

Tests verify the JSON-RPC contract, all tool-to-HTTP mappings, OAuth challenges, denied operations,
private resource routing and token isolation between simultaneous requests. A loopback HTTP test
exercises the complete MCP-to-REST path; it binds only to `127.0.0.1` and closes both servers.
End-to-end API, account and database tests run in the Hidden Jobs application repository.

The hosted entry point uses a pinned copy of these source files. Its validation checks file hashes,
career tool schemas and workflow parity. Changes to shared integration code must update that copy
and its source revision before the corresponding backend release.

## Update workflows and schemas

Edit `src/resources/workflows.ts`, then regenerate portable skill files:

```bash
deno task skills:sync
deno task docs:check
deno task skills:check
```

Keep the hosted implementation's workflow definitions synchronized. Tool arguments are defined in
the domain files in `src/tools/`, registered by `src/tools/index.ts`. Resource and prompt bindings live in
`src/resources/index.ts`. The documentation check validates the catalogue, JSON-RPC examples and
local Markdown links.

## Check a hosted connection

Check initialization, schemas, OAuth resource metadata and the unauthenticated challenge:

```bash
deno task smoke
```

This read-only check reports whether authenticated tool calls were exercised. For an authenticated
check, complete OAuth in your client and store a current token in a private file outside the
repository:

```bash
HIDDEN_JOBS_OAUTH_TOKEN_FILE=/private/path/access-token.txt \
  CHECK_APPLICATION_LINK=true deno task smoke
```

The check searches, reads a returned offer and verifies either application-link access or the
account-access denial. Tokens and application URLs are never printed. It does not perform
browser login or refresh tokens. An expired token or empty search result fails the check.

To check a development endpoint, set `HIDDEN_JOBS_MCP_URL` and `MCP_RESOURCE_URL` to its public MCP
URL. Discover its OAuth endpoints from resource metadata. Backend provisioning and deployments are
managed in the Hidden Jobs application repository.

## External-source adapters

`src/sources/index.ts` exports `createExternalJobs(fetcher, now)`. The fetch and clock dependencies can be injected; importing the module performs no network request. The default fetcher is used only when a search or detail lookup is requested.

```ts
import { createExternalJobs } from '../src/sources/index.ts';

const sources = createExternalJobs();
const result = await sources.search(
  'remoteok',
  new URLSearchParams({ q: 'typescript', limit: '10' }),
);
```

The adapters contain public provider URLs, temporary public-response caching, normalization, source attribution, location filtering and opaque references/cursors. They do not authenticate accounts, enforce subscriptions, query the Hidden Jobs catalogue or store records. The remote MCP still calls the hosted REST API; moving adapters here does not make the MCP client query providers directly. The hosted backend vendors this same source with revision and hash checks. Provider behavior is tested with injected responses, without live requests or credentials.
