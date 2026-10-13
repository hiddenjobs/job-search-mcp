# Security policy

## Credentials

OAuth access and refresh tokens are bearer credentials managed by the client.
Never put them in prompts, screenshots, logs or issues. Users authorize access
through Hidden Jobs login and consent, without pasting website session tokens.
Use the provider's disconnect/reconnect controls as appropriate; removing a
local client entry is not a guarantee of server-side consent revocation.

The API-key alternative still uses bearer access keys. Do not commit them, include them in screenshots, or paste them into issues and pull requests. Store them in an MCP client's secret store or an environment variable.

If a key is exposed, revoke it from the [developer dashboard](https://hiddenjobs.dev/dashboard) and create a replacement immediately.

Keep server credentials on the server. Never include administrative credentials
in client configuration or this repository.

## Reporting a vulnerability

Do not open a public issue for a security vulnerability. Contact the maintainers privately with:

- A short description of the issue
- The affected endpoint or file
- Reproduction steps that do not include live credentials
- The potential impact

Please allow time for assessment and remediation before public disclosure.
