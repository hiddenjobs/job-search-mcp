# Contributing

Thanks for helping improve Hidden Jobs MCP.

## Before opening a pull request

Run the same checks used by CI:

```bash
deno task fmt
deno task check
```

Keep changes focused. Update the relevant documentation when a tool schema, response shape, environment variable, deployment step, or security rule changes.

## Pull requests

Include:

- What changed
- Why it changed
- How it was tested
- Any compatibility or deployment notes

Never include live API keys, Supabase credentials, application URLs obtained from a private request, or customer data in a pull request.
