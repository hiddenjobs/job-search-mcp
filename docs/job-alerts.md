# Email job alerts

Use the connected Hidden Jobs account to manage the same searches shown in **Dashboard → Alerts**.
Alerts email the account's existing, confirmed address; the MCP cannot change the recipient or send
a test message. No extra account permission screen is required.

| Action                                               | Tool                |
| ---------------------------------------------------- | ------------------- |
| Read settings, filter choices and current version    | `get_job_alerts`    |
| Create a daily or weekly search                      | `create_job_alert`  |
| Change filters, frequency, name or enabled state     | `update_job_alert`  |
| Remove one search                                    | `delete_job_alert`  |
| Pause all delivery, retaining searches               | `pause_job_alerts`  |
| Resume delivery, retaining individual enabled states | `resume_job_alerts` |

## Filters and access

Save up to five alerts. Each alert has its own `daily` or `weekly` frequency. `query` is optional;
filter fields `category`, `employmentType`, `jobType` and `remoteLocation` accept arrays of allowed
values returned by `get_job_alerts`. For example, `["Backend", "DevOps"]` matches either category;
that category filter combines with the location filter using AND. `["All"]` removes a filter.
Regional searches also include worldwide roles, following the dashboard's matching rules.

Creating, modifying or resuming requires account access and a confirmed account email.
You can also pause all alerts or delete a search. The same
scheduler, deduplication and unsubscribe system serves the dashboard and connected assistants.
Creating an alert while global delivery is paused keeps it paused.

## Read before changing

First call `get_job_alerts`. Saved entries are under `config.alerts`; each has an `id`, `q` (search text), filters, frequency and enabled state. Mutations accept that search text as `query`. Use the returned `config.version` as `expectedVersion` for create,
update, delete and resume. New accounts start at `0`. IDs come from the response; the server generates
them when creating. A `409` means another client changed the settings: reread and reapply only the
requested change. Do not blindly retry a creation after an uncertain response. Global pause needs
no version because it only stops delivery and never overwrites saved filters.

For example: **“Create a daily alert for Backend or DevOps roles in Europe matching TypeScript.”**
After reading version `0`, your assistant can call:

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "create_job_alert",
    "arguments": {
      "name": "TypeScript Europe",
      "query": "typescript",
      "category": ["Backend", "DevOps"],
      "remoteLocation": ["EUROPE"],
      "frequency": "daily",
      "expectedVersion": 0
    }
  }
}
```

To disable just one alert, call `update_job_alert` with its `alertId`, `enabled: false` and the latest
version. To disable all alerts, call `pause_job_alerts`. Resuming all delivery does not reactivate
individually disabled searches; use `update_job_alert` with `enabled: true` for those.

The [alerts skill](../skills/alerts/SKILL.md), `alerts` prompt and
`hiddenjobs://workflows/alerts` resource provide the same instructions.
REST integrations use the corresponding `/me/alerts` endpoints in the
[API documentation](https://hiddenjobs.dev/api/docs).
