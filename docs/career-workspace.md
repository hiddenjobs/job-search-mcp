# Your career workspace

Use your assistant to find Hidden Jobs offers, evaluate fit, tailor CVs and cover letters, practise
interviews and keep track of applications. Your assistant supplies the language model; Hidden Jobs
stores the information and files you choose to keep.

## Start with your account

1. Connect `https://hiddenjobs.dev/mcp` and sign in.
2. Start the setup workflow from your connected assistant.
3. Import or upload a CV, confirm your profile and save named CVs.
4. Choose a CV version, search offers and prepare an application.
5. Review your documents, export a PDF and submit on the employer's website.
6. Confirm the submission or later outcomes to your assistant, or update them in **Applications**.

For example: **“Use Backend English, version 3, to tailor my CV and write a cover letter for this
role.”** The assistant reads the selected version, captures the offer, saves new documents and marks
the application prepared. Version 4 created later does not change the version stored with that
application.

## What stays in Hidden Jobs

| Information       | How it is kept                                                                                |
| ----------------- | --------------------------------------------------------------------------------------------- |
| Profile           | Confirmed experience, preferences and default CV selection                                    |
| CV library        | Independent named CVs with immutable version-to-file references                               |
| Documents         | Private originals, extracted text, assistant-written drafts, PDFs and templates               |
| Applications      | Offer snapshot, exact base CV version, final document references, state, notes and next steps |
| History           | Changes to each application, with dates and connection identity                               |
| Evaluations       | Your assistant's assessments linked to an offer and CV version                                |
| Search activity   | Saved filters, viewed/saved/discarded offers                                                  |
| Learning          | Assistant-written plans and user-reported progress                                            |
| Connection access | Active OAuth applications authorized for your account                                         |

**Profile** manages your experience, CVs, active connections, export and data controls.
**Applications** shows progress, five-row tables, status filters and application details. The MCP
works from remote chats as well as terminal clients; it does not depend on a personal project
folder.

## CV and document transfer

A chat attachment is not automatically readable by a remote server. Your client can transfer a file
using:

| Method                   | Flow                                                                                                                        |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| Signed upload            | `create_document_upload` with `mode: "signed"` → client transfers actual bytes to `uploadUrl` → `finalize_document_upload`  |
| Chunked upload           | `create_document_upload` with `mode: "chunks"` → `upload_document_chunk` for zero-based chunks → `finalize_document_upload` |
| Supported file reference | `import_document` with the actual HTTPS download reference from an allowlisted client file origin                           |
| Account upload           | Upload the file in **Profile**, then read the saved CV/document from your assistant                                         |

All routes transfer the original file. Never invent a download URL or claim a file is imported
before it is ready. Request upload metadata using the actual filename, MIME type, byte count and
SHA-256. Chunks contain at most 8192 decoded bytes, within the 16 KiB MCP request limit.

PDF, DOCX and UTF-8 text/Markdown are supported, up to 2 MiB and 20 PDF pages. Finalization
validates size, digest and file structure, then extracts text directly. Scanned PDFs need supplied
text; OCR is not included.

## Multiple CVs and tailored documents

`save_document` stores a draft or uploaded text. `save_cv` adds a document to a named CV as an
immutable version. Use `list_cvs` / `get_cv` to select the version, and `set_default_cv` for the
default. The default is a convenience, not permission to replace an application's selection.

You can delegate the choice: **“Compare all my saved CVs against this offer, choose the best match
and use it to prepare my application.”** The assistant reads all active CVs, using each latest ready
version unless you specify otherwise, compares their actual contents with the offer and explains its
choice. It follows pagination to include all CVs and discloses any unreadable content. Your default
CV stays unchanged. If you have already named a CV, that selection takes priority.

`save_application` records a specific `cvVersionId`. The assistant can then save a tailored CV and
letter as separate documents and attach their IDs using `update_application`. This keeps the base CV
separate from the final application documents. `select_application_cv` changes the base version only
while the application is in preparation.

Submitted CV selection and final CV/cover-letter references are immutable. Rename, archive or create
later versions without rewriting a previous application's historical selection.

## Applications and outcomes

| State       | Meaning                                |
| ----------- | -------------------------------------- |
| `saved`     | Draft application created for an offer |
| `preparing` | Working on the application             |
| `prepared`  | Documents ready for review/submission  |
| `applied`   | User confirmed actual submission       |
| `interview` | User confirmed the interview stage     |
| `offer`     | User confirmed an offer                |
| `rejected`  | User confirmed rejection               |
| `withdrawn` | User confirmed withdrawal              |

The backend appends change history. Notes-only edits can omit status; submitted/outcome records
cannot return to preparation. The tools do not detect submissions or employer responses
automatically.

For example: **“I have an interview next Tuesday. Update this application's status and save ‘prepare
project examples’ as the next step.”** The assistant confirms the event and records the update.
Gmail-based proposals need your separately connected Gmail and approval; Hidden Jobs stores only
approved references and summaries.

## Interviews, learning and company information

`get_company` takes a job ID and returns anonymous industry, company size, founding year and
verification date. Employer names, slugs, websites and descriptions are withheld. The interview
workflow combines these with the actual offer, selected CV and confirmed experience to create
practice questions and answers. It does not claim access to company interview reviews, a colleague
directory or market salary comparisons. Salary discussion uses the offer's disclosed salary and your
preferences.

Learning plans come from the assistant's comparison of requirements and your evidenced skills.
Hidden Jobs saves the plan and progress you report; it does not run a model behind these endpoints.

## Templates and PDF export

Save text structures with `save_document` using `kind: "template"`. For rendering, a template may
contain validated JSON settings: `fontSize` 10–14, `margin` 36–72 and `pageSize` A4 or Letter.
Source templates may be stored as references; LaTeX, scripts and arbitrary CSS are not executed.

Use `render_document` on a saved text document, optionally with a supported layout template.
`check_document` reports extraction/layout warnings. The renderer supports Latin characters,
wrapping and pagination, and runs directly in the request. Review the final PDF visually; a
text/layout check does not guarantee ATS acceptance. Download links expire after 60 seconds.

## Connection, export and deletion

The OAuth connection authorizes career operations for its owning account. The server verifies the
account, client, active consent and live session on authenticated MCP requests. Revoked connections
must reconnect; another account cannot read your files or application records.

`export_user_data` produces a private manifest and short-lived file links. Download the files before
links expire. `delete_document` refuses referenced files. `reset_user_data` opens the account
confirmation step; you choose the scope and confirm deletion there. Account and
job-board data are preserved.

See [skills](skills.md), [tools](tool-reference.md), [resources and prompts](resources.md), and
[integration development](development.md).

## External offers

`search_jobs` also supports external sources; see [job sources](job-sources.md). You can compare their requirements and draft documents with your assistant, but external offers are not imported into career records. Application tracking, saved job evaluations, job activity and email alerts still require a Hidden Jobs jobId.
