# Security policy

## Account access

Connect through Hidden Jobs sign-in and review the application's access before approving. Your MCP
client manages connection credentials. Keep them out of prompts, screenshots, logs and source
control.

Use your client's disconnect and reconnect controls when needed. Removing a local server entry does
not guarantee that account authorization has been revoked. Keep administrative credentials and
private customer data out of this repository.

## Private career information

OAuth authorizes the connected application to work with the owning account’s profile, CVs, documents
and applications. The same approval covers the career workflow. Profile lists active connections.
Export and confirmed data deletion are managed from the account page.

Application history keeps the chosen base CV version and submitted document references stable. For
example, uploading a new CV does not replace a CV attached to an earlier submitted application.
OAuth consent/session validity and account ownership are checked on access.

Job descriptions, CVs and imported files are untrusted content. Workflow instructions tell the
assistant to ignore embedded instructions and use confirmed facts. Review drafts and generated PDFs
before submitting. An assistant's fit assessment or practice interview question is not verified
employer feedback.

File references are limited to configured HTTPS origins. Files are private, bounded in size,
validated and accessed through expiring capabilities. Templates cannot execute scripts, LaTeX or
arbitrary CSS. Account deletion confirmation cannot be bypassed by the reset MCP tool. Gmail
proposals use the client's separately authorized Gmail connection and store only approved
references/summaries.

## Reporting a vulnerability

Contact the maintainers privately with a description, affected endpoint, reproduction steps without
credentials and the potential impact. Do not open a public issue containing sensitive details. Allow
time for assessment and remediation before disclosure.
