# Architecture

Hidden Jobs MCP is a protocol adapter. It does not maintain a second job database and it does not implement a second authorization model.

```mermaid
flowchart TB
    subgraph Client[User environment]
        Agent[MCP-compatible AI client]
        Secret[Client secret store]
    end

    subgraph Adapter[Hidden Jobs MCP]
        HTTP[Streamable HTTP endpoint]
        JSONRPC[JSON-RPC dispatcher]
        Tools[Tool argument validation]
    end

    subgraph Platform[Hidden Jobs platform]
        REST[REST API]
        Auth[API key scope and rate checks]
        Jobs[(Public job records)]
        Billing[(Subscription state)]
        Source[Original application URL]
    end

    Secret -->|Bearer token| Agent
    Agent -->|HTTP POST| HTTP
    HTTP --> JSONRPC --> Tools
    Tools -->|Forward bearer token| REST
    REST --> Auth
    Auth --> Jobs
    Auth --> Billing
    Billing -->|Active subscription| Source
```

## Trust boundaries

### MCP client to MCP server

The client sends a Hidden Jobs API bearer key. The server does not receive a Supabase Auth session and does not need one.

### MCP server to REST API

The MCP adapter forwards the original `Authorization` header. The REST API remains the authority for key validity, scopes, rate limits, monthly usage, subscription checks, and URL release.

### Public job data to original URLs

`search_jobs` and `get_job` return descriptions and metadata but not the source URL. `open_application_link` is a separate operation with a separate scope and subscription check.

## Failure propagation

REST errors are converted into MCP tool errors. This preserves a readable message while retaining the original HTTP status and API code in `structuredContent` when available.
