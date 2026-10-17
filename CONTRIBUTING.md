# Contributing

Run the checks used by CI with Deno 2:

```bash
deno task fmt
deno task check
deno task test
```

Tests use local signing keys and backend fixtures. They cover token verification, live account
validation, subscription access and the smoke-check flow without accessing customer accounts.

For a live discovery check, run `deno task smoke`. See [server development](docs/deployment.md) for
local configuration, backend prerequisites and the optional authenticated check. For example, a
change to account validation should include a test showing that revoked sessions cannot call tools.

Keep changes focused. Update documentation when schemas, responses, environment variables or
security rules change. Include the reason for the change and the checks run in your pull request.
Never include credentials, private application URLs or customer data.
