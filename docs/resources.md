# Resources and prompts

Tools perform operations. Resources supply information and reusable guidance. Prompts load a
workflow as a user message for the assistant. For example, use the `interview` prompt, read the
saved application resource, and save interview preparation with `save_document`.

## Assistant guidance

The `initialize` response includes shared instructions to prefer the connected sources through
`search_jobs`, respect the user's explicit source selection, and load the matching workflow.
The opening instructions ask the assistant to offer a named, reusable CV version after tailoring
and a recurring search through the assistant’s native scheduler after a focused search, when the host can execute this MCP unattended. Hidden Jobs email alerts remain an alternative. Tool descriptions repeat these
next steps when clients do not load resources or prompts. Suggestions respect declined or already
completed actions; persistence, scheduled tasks and email alerts require the user's agreement.
These guide the assistant; the host decides which instructions to expose and which tools to call.

For example, “Help me apply to this Hidden Jobs role” leads to reading the offer and saved CVs.
If no suitable CV exists, the assistant asks for one and offers to save it with permission before
preparing documents. File transfer depends on the client; dashboard upload is the fallback when
attachment bytes cannot be transferred. External offers support document preparation, not saved
application tracking. Tool success must be verified before claiming anything was saved or submitted.

## Resource catalogue

`resources/list` returns 22 shared resources: 15 workflows, four guides and three text templates.
`resources/templates/list` returns the four private profile/CV/application/document URI patterns.
Private record IDs come from the relevant list/get tools; they are not enumerated publicly.

| URI                                 | MIME type          | Contents / names                                                                                                                                                |
| ----------------------------------- | ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `hiddenjobs://workflows/{name}`     | `application/json` | `alerts`, `setup`, `expand`, `search`, `match`, `apply`, `review`, `export`, `interview`, `upskill`, `outcome`, `email-sync`, `report`, `add-template`, `reset` |
| `hiddenjobs://guides/{name}`        | `text/plain`       | `job-evaluation`, `document-review`, `interview`, `ats-checks`                                                                                                  |
| `hiddenjobs://templates/{name}`     | `text/plain`       | `cv`, `cover-letter`, `interview`                                                                                                                               |
| `hiddenjobs://me/profile`           | `application/json` | Confirmed profile, preferences and default CV                                                                                                                   |
| `hiddenjobs://me/cvs/{id}`          | `application/json` | CV metadata and a page of immutable versions                                                                                                                    |
| `hiddenjobs://me/applications/{id}` | `application/json` | Application, offer snapshot, selected CV version and a page of history                                                                                          |
| `hiddenjobs://me/documents/{id}`    | `application/json` | Saved text and metadata; use `get_document_download_url` for the original file                                                                                  |

Shared instructions and templates contain no private account data. Reading private resources
requires an active OAuth connection for the owning account, just like the corresponding tools.

## Read a workflow resource

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "resources/read",
  "params": { "uri": "hiddenjobs://workflows/apply" }
}
```

The result contains `contents`, with a JSON text document describing the workflow name, version,
title and instructions.

## Read your profile

```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "method": "resources/read",
  "params": { "uri": "hiddenjobs://me/profile" }
}
```

To read another private record, replace `{id}` with the UUID returned by `list_cvs`,
`list_applications` or `list_documents`. Private resources return the first page for paginated
children; use `get_cv` or `get_application` with `page` and `limit` for more versions or history.

## MCP prompts

`prompts/list` returns 15 prompts using the same workflow names as the [skill catalogue](skills.md).
Prompts take no arguments; include the job, CV choice and your preferences in the conversation.

```json
{ "jsonrpc": "2.0", "id": 3, "method": "prompts/get", "params": { "name": "interview" } }
```

The result contains a `messages` array with the workflow instructions as a user message. The
assistant then calls tools to read the actual application and prepare documents; fetching the prompt
alone does not perform the workflow.

## Clients without a resource or prompt interface

Ask the assistant to use `get_workflow` instead:

```json
{
  "jsonrpc": "2.0",
  "id": 4,
  "method": "tools/call",
  "params": { "name": "get_workflow", "arguments": { "name": "interview" } }
}
```

Use `get_candidate_profile`, `get_cv`, `get_application` and `get_document` to read private data
through tools. Prompt, resource and skill support varies by client; the workflow and data do not
require a local filesystem.

The `alerts` workflow manages recurring email searches. Read
`hiddenjobs://workflows/alerts` or request prompt `alerts`; see [job alerts](job-alerts.md).

## CV upload panel

`ui://hiddenjobs/upload-cv-v1.html` is an MCP Apps HTML resource linked to `upload_cv`.
It contains a file picker and save confirmation. Its CSP permits only the configured upload origins;
file bytes go directly from the browser to private storage. The assistant receives the verified CV
and version identifiers. Hosts without MCP Apps use the normal tools or dashboard.
