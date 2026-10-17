# Backend contract

The resource server uses the existing Hidden Jobs accounts, jobs and subscription backend. Local
execution requires that backend, its account authorization server and the following contracts. The
repository contains the MCP resource server; backend schema and account provisioning are managed
separately.

## Account tokens

The trusted issuer exposes an ES256 signing key through `/.well-known/jwks.json`. Tokens must have:

| Claim                            | Required value                          |
| -------------------------------- | --------------------------------------- |
| `iss`                            | Configured issuer URL                   |
| `aud`                            | Exact `MCP_RESOURCE_URL`                |
| `role`                           | `mcp_client`                            |
| `mcp_access`                     | `true`                                  |
| `sub`, `client_id`, `session_id` | Account, OAuth client and session UUIDs |
| `exp`, `iat`                     | Valid expiration and issued-at times    |

Anonymous tokens are rejected. Ordinary website sessions retain their existing audience and role.
Configure these claims only for the MCP's OAuth sessions. The restricted `mcp_client` role must not
have direct access to account, subscription or jobs tables through the public Data API.

## Live account validation

The server calls `mcp_native_consume(p_user_id uuid, p_client_id uuid, p_session_id uuid)` using its
private backend credential after validating the token signature. The RPC must atomically:

1. Verify that the account is active and non-anonymous.
2. Verify that the session belongs to that account and client and remains valid.
3. Verify that the OAuth client and its consent remain active.
4. Enforce 600 tool calls per minute per account across clients.

Return `{ "ok": true, "userId": "<account UUID>" }` on success or
`{ "ok": false, "reason": "invalid" }` for revoked or invalid access. Use `rate_limit` for an
exhausted quota. Database failures must raise an error so the MCP reports temporary unavailability.
Restrict RPC execution to the server credential. It must not be callable by anonymous clients or
ordinary signed-in users. Check revocation on every tool request, including requests with an
unexpired token.

## Jobs

The configured jobs table supports active-offer queries by `id` (UUID) or `slug`, newest first, with
`is_active`, `created_at`, `category`, `employment_type`, `job_type`, `remote_scope` and
`remote_location_codes` filters.

Public fields are mapped in [`src/jobs.ts`](../src/jobs.ts). For example, `company_slug` becomes
`companySlug` and `skills` remains an array. Stored `url` and `application_url` are used to compute
`hasApplicationLink`; the URLs are excluded from search and detail output.

Text search calls `search_jobs(p_terms text[], p_filters jsonb, p_limit integer, p_offset integer)`.
The RPC returns job objects and a total, for example:

```json
{ "jobs": [{ "id": "<job UUID>", "title": "Engineer", "is_active": true }], "totalCount": 1 }
```

Filters contain `category`, `employmentType`, `jobType`, `remoteLocation` and `remoteLocationCodes`.
Apply the same active-offer and regional eligibility rules as table queries; regional searches also
include worldwide offers.

## Subscription access

`stripe_subscriptions` provides `user_id`, `status`, `updated_at` and `current_period_end`. The
latest matching subscription grants access when its status is `active`, `trialing` or `cancelling`
and its period has not expired; a null period end is treated as ongoing access. The server checks
this before retrieving an application URL on every `open_application_link` call.

For example, revoking consent prevents all further tool use; ending Access prevents application-link
retrieval while search and descriptions remain available to a connected account.
