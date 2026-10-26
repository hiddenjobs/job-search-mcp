# REST adapter

The hosted MCP and this repository use the same HTTP adapter. Every tool calls the Hidden Jobs REST
API at `https://api.hiddenjobs.dev/v1`. Account storage and processing remain in that API.

`src/index.ts` binds the JSON-RPC handler to `src/api/client.ts`. Each request keeps its own OAuth
token; no account token is stored in shared state. The API verifies the exact account-token
audience, signature, expiry and live session/consent, and enforces ownership, account access and
quota. The MCP and its first-party REST API form one OAuth protected service. The adapter never
sends credentials to a third-party resource or follows HTTP redirects.

For example, `save_cv` sends `POST /me/cvs` with the user's OAuth bearer token and the documented
tool arguments. Path arguments are encoded into the URL; remaining read arguments become query
parameters and write arguments become JSON. `search_jobs.query` becomes REST's `q` parameter. Its required `sources` array becomes a comma-separated query value and optional `cursors` becomes JSON. REST callers must also select sources explicitly. `get_job` and `open_application_link` require and forward the result source unchanged. One
tool operation makes one API request; the adapter does not retry writes automatically.

Shared resources and prompts are supplied by the integration. Private resources call the matching
REST operation: profile, CV, application or document. API failures become MCP errors, with OAuth
reconnection challenges for expired or invalid authorization.

## Tool routes

Paths below are relative to the REST API base URL. Full argument definitions are in the
[tool reference](tool-reference.md) and the
[API OpenAPI document](https://api.hiddenjobs.dev/v1/openapi.json).

| Tool                        | Method   | Path                                         |
| --------------------------- | -------- | -------------------------------------------- |
| `search_jobs`               | `GET`    | `/jobs`                                      |
| `get_job`                   | `GET`    | `/jobs/{idOrSlug}`                           |
| `open_application_link`     | `POST`   | `/jobs/{idOrSlug}/application-link`          |
| `get_company`               | `GET`    | `/jobs/{idOrSlug}/company`                   |
| `get_workflow`              | `GET`    | `/workflows/{name}`                          |
| `get_candidate_profile`     | `GET`    | `/me/profile`                                |
| `save_candidate_profile`    | `PUT`    | `/me/profile`                                |
| `list_cvs`                  | `GET`    | `/me/cvs`                                    |
| `get_cv`                    | `GET`    | `/me/cvs/{cvId}`                             |
| `save_cv`                   | `POST`   | `/me/cvs`                                    |
| `update_cv`                 | `PATCH`  | `/me/cvs/{cvId}`                             |
| `set_default_cv`            | `PUT`    | `/me/default-cv`                             |
| `select_application_cv`     | `PUT`    | `/me/applications/{applicationId}/cv`        |
| `create_document_upload`    | `POST`   | `/me/document-uploads`                       |
| `finalize_document_upload`  | `POST`   | `/me/document-uploads/{documentId}/complete` |
| `import_document`           | `POST`   | `/me/documents/import`                       |
| `list_documents`            | `GET`    | `/me/documents`                              |
| `get_document`              | `GET`    | `/me/documents/{documentId}`                 |
| `get_document_download_url` | `POST`   | `/me/documents/{documentId}/download`        |
| `save_document`             | `POST`   | `/me/documents`                              |
| `delete_document`           | `DELETE` | `/me/documents/{documentId}`                 |
| `render_document`           | `POST`   | `/me/documents/{documentId}/pdf`             |
| `check_document`            | `GET`    | `/me/documents/{documentId}/check`           |
| `get_search_history`        | `GET`    | `/me/searches`                               |
| `save_search_history`       | `POST`   | `/me/searches`                               |
| `list_job_activity`         | `GET`    | `/me/job-activity`                           |
| `update_job_activity`       | `PUT`    | `/me/job-activity/{jobId}`                   |
| `get_job_evaluations`       | `GET`    | `/me/evaluations`                            |
| `save_job_evaluation`       | `POST`   | `/me/evaluations`                            |
| `list_applications`         | `GET`    | `/me/applications`                           |
| `get_application`           | `GET`    | `/me/applications/{applicationId}`           |
| `save_application`          | `POST`   | `/me/applications`                           |
| `update_application`        | `PATCH`  | `/me/applications/{applicationId}`           |
| `get_learning_plan`         | `GET`    | `/me/learning-plans`                         |
| `save_learning_plan`        | `POST`   | `/me/learning-plans`                         |
| `get_application_report`    | `GET`    | `/me/application-report`                     |
| `export_user_data`          | `POST`   | `/me/exports`                                |
| `reset_user_data`           | `GET`    | `/me/reset-preview`                          |

Job results omit employer names and identifying slugs. Company context uses the job ID and returns
only industry, employee range, founding year and verification date. HTTP `402` indicates that account action is required, including for direct REST calls with the same OAuth token.

## Client attachment references

`import_document` declares the optional `file` input with `download_url`, `file_id`, `mime_type`
and `file_name`. The optional `openai/fileParams` tool metadata lets ChatGPT supply an authorized
attachment reference. Other clients can supply the same object or keep using `sourceUrl`; no
provider SDK or API key is required. The REST backend downloads only explicitly approved HTTPS
origins configured through `CAREER_IMPORT_ORIGINS`, rejects redirects and validates the original
file before saving. The client metadata does not bypass that origin policy. Signed uploads and
the in-chat upload panel is available when a client cannot provide a reference.
