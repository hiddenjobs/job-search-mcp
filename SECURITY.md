# Security policy

## Credentials

Hidden Jobs API keys are bearer credentials. Do not commit them, include them in screenshots, or paste them into issues and pull requests. Store them in an MCP client's secret store or an environment variable.

If a key is exposed, revoke it from the Hidden Jobs developer dashboard and create a replacement immediately.

Supabase anonymous keys belong in the server-side Edge Function configuration. A Supabase service-role key must never be sent to an MCP client or included in this repository.

## Reporting a vulnerability

Do not open a public issue for a security vulnerability. Contact the Hidden Jobs maintainers privately with:

- A short description of the issue
- The affected endpoint or file
- Reproduction steps that do not include live credentials
- The potential impact

Please allow time for assessment and remediation before public disclosure.
