# Remote job search tool reference

Both endpoints expose three tools through `tools/call`. Account OAuth requires
a valid connected account; the API-key alternative requires `jobs:read` for
search/detail. Example: connect your Hidden Jobs account, search TypeScript jobs,
then retrieve one application's link if your Access subscription is active.

## `search_jobs`

Searches public remote job offers.

### Arguments

| Argument | Type | Required | Notes |
| --- | --- | --- | --- |
| `query` | string | No | Keywords, role, skills, or company |
| `category` | string | No | Job category |
| `employmentType` | string | No | Employment type |
| `jobType` | string | No | Job type |
| `remoteLocation` | string | No | For example `Worldwide`, `US`, `Europe`, `Spain`, or `Germany` |
| `page` | integer | No | Starts at `1`, defaults to `1` |
| `limit` | integer | No | From `1` to `50`, defaults to `10` |

Example call:

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "search_jobs",
    "arguments": {
      "query": "typescript",
      "remoteLocation": "Europe",
      "limit": 3
    }
  }
}
```

The result contains public job data and pagination:

```json
{
  "data": {
    "jobs": [
      {
        "id": "job-uuid",
        "slug": "senior-typescript-engineer-job-uuid",
        "title": "Senior TypeScript Engineer",
        "description": "Full job description...",
        "company": "Example Co",
        "location": "Europe",
        "category": "Engineering",
        "employmentType": "Full-time",
        "jobType": "Permanent",
        "skills": ["TypeScript", "React"],
        "hasApplicationLink": true
      }
    ],
    "totalCount": 1,
    "page": 1,
    "limit": 3,
    "hasMore": false
  }
}
```

The original source URL is never included in this response.

## `get_job`

Loads the public details and full description for one offer.

### Arguments

| Argument | Type | Required | Notes |
| --- | --- | --- | --- |
| `idOrSlug` | string | Yes | The UUID or slug returned by `search_jobs` |

Example call:

```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "method": "tools/call",
  "params": {
    "name": "get_job",
    "arguments": {
      "idOrSlug": "senior-typescript-engineer-job-uuid"
    }
  }
}
```

The response uses the same public job fields as the REST API and includes the full description. It does not include `url`, `application_url`, or `source_url`.

## `open_application_link`

Returns the original application URL for one offer.

### Arguments

| Argument | Type | Required | Notes |
| --- | --- | --- | --- |
| `idOrSlug` | string | Yes | The UUID or slug returned by `search_jobs` |

Example call:

```json
{
  "jsonrpc": "2.0",
  "id": 3,
  "method": "tools/call",
  "params": {
    "name": "open_application_link",
    "arguments": {
      "idOrSlug": "senior-typescript-engineer-job-uuid"
    }
  }
}
```

This tool requires:

- OAuth: a valid connected account with an active Access subscription
- API-key alternative: `application-links:read` and active Access for the key owner

On success, the tool result contains:

```json
{
  "data": {
    "url": "https://example.com/application"
  }
}
```

Without active Access, the tool result is marked `isError: true` with subscription-required status `402` in `structuredContent`. Check the Access subscription for the connected account, or the key owner when using an API key.

## Access errors

| Status | Code | Meaning |
| --- | --- | --- |
| `400` | `invalid_arguments` | A required tool argument is missing |
| `401` | Authentication required | OAuth: reconnect the account. API-key endpoint: check the key |
| `402` | `subscription_required` | An active subscription is needed for the original URL |
| `403` | `insufficient_scope` or `paused` | API-key endpoint only: key scope or status |
| `429` | Rate or usage limit | OAuth: 600 calls/minute/account. API keys: configured limits |
| `503` | `backend_error` | The API authentication backend is temporarily unavailable |
