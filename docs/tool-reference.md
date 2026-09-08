# Tool reference

The MCP server exposes three tools through `tools/call`.

## `search_jobs`

Searches public Hidden Jobs offers.

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

- The `application-links:read` scope
- An active Hidden Jobs Access subscription for the API key owner

On success, the tool result contains:

```json
{
  "data": {
    "url": "https://example.com/application"
  }
}
```

Without an active subscription, the REST API returns HTTP `402` with `subscription_required`. The MCP result is marked `isError: true` and includes the same status in `structuredContent`.

## Access errors

| Status | Code | Meaning |
| --- | --- | --- |
| `400` | `invalid_arguments` | A required tool argument is missing |
| `401` | `missing`, `invalid`, `revoked`, or `expired` | The bearer key is not usable |
| `402` | `subscription_required` | An active subscription is needed for the original URL |
| `403` | `insufficient_scope` or `paused` | The key cannot perform the operation |
| `429` | `rate_limit` or `monthly_limit` | A configured usage limit was reached |
| `503` | `backend_error` | The API authentication backend is temporarily unavailable |
