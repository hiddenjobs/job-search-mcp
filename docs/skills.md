# Skills and workflows

A skill is an instruction set for your assistant, not a model running inside Hidden Jobs. The 15
skills cover profile setup, searching, ranking, tailored applications, review, PDF export,
interviews, learning, email alerts and progress tracking.

## Recurring searches

After a focused search, the `search` workflow first offers the assistant’s native scheduler when
it can call the MCP unattended. It preserves the chosen sources, filters and profile/CV, and asks
for a time and timezone before creating a task. A reminder is not a scheduled MCP search.
For example: **“Search these sources daily at 09:00 Europe/Madrid and notify me of new matches.”**
Hidden Jobs email alerts remain an alternative when native execution is unavailable or preferred.

## Email alerts

[`alerts`](../skills/alerts/SKILL.md) manages the saved searches in your Hidden Jobs dashboard.
Use resource `hiddenjobs://workflows/alerts` or MCP prompt: `alerts`.
Tools: `get_job_alerts`, `create_job_alert`, `update_job_alert`, `delete_job_alert`,
`pause_job_alerts`, `resume_job_alerts`. For example: **“Create a weekly Backend alert for Spain.”**
Read the account's current `config.version` and pass it as `expectedVersion` when creating,
updating, deleting or resuming. See [job alerts](job-alerts.md) for Access requirements.

## Use a skill in your client

Copy the selected `skills/<name>/` directory into the skill location supported by your client. Keep
its `SKILL.md` and directory name together. For example, Claude Code project skills live under
`.claude/skills/`; follow your client's instructions for its location and invocation. Connect the
Job Search MCP and sign in with your Hidden Jobs account.

You can ask: **“Use apply to tailor my CV and cover letter for this role.”** Slash-command names and
skill-loading behaviour depend on the client; this repository does not register universal `/apply`
commands.

## Use the same workflow in a remote chat

Local skill installation is not required to use the workflows. In a chat client with the remote
Hidden Jobs connection, ask: **“Read the apply workflow, then prepare this application using Backend
English, version 3.”** The assistant can call:

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": { "name": "get_workflow", "arguments": { "name": "apply" } }
}
```

It receives instructions and then uses the career tools. Clients that expose MCP prompts can request
`apply` with `prompts/get`; clients that expose resources can read `hiddenjobs://workflows/apply`.
These are three ways to retrieve the same workflow. Do not assume all clients show identical menus.

## Workflow catalogue

## `setup` — Build your profile

Import a CV, confirm your experience and preferences, and choose a default CV.

> Set up my profile using this CV.

- Skill file: [SKILL.md](../skills/setup/SKILL.md)
- MCP prompt: `setup`
- Resource: `hiddenjobs://workflows/setup`
- Tool instructions: `get_workflow` with `{"name":"setup"}`
- Typical tools: `get_candidate_profile`, `save_candidate_profile`, `create_document_upload`,
  `import_document`, `save_cv`, `set_default_cv`.

## `expand` — Add depth to your profile

Capture achievements, responsibilities and examples that make applications specific.

> Help me describe my backend projects more clearly.

- Skill file: [SKILL.md](../skills/expand/SKILL.md)
- MCP prompt: `expand`
- Resource: `hiddenjobs://workflows/expand`
- Tool instructions: `get_workflow` with `{"name":"expand"}`
- Typical tools: `get_candidate_profile`, `get_cv`, `save_candidate_profile`, `save_cv`.

## `search` — Find remote jobs

Search the selected sources: Hidden Jobs, Jobicy, We Work Remotely, Remote OK or Himalayas.
`sources` is required. Check location eligibility and keep each result’s attribution and source link.
External queries and provider links are free; saved job activity and alerts use Hidden Jobs offers.

> Search Hidden Jobs and Jobicy for remote TypeScript roles open to applicants in Spain.

- Skill file: [SKILL.md](../skills/search/SKILL.md)
- MCP prompt: `search`
- Resource: `hiddenjobs://workflows/search`
- Tool instructions: `get_workflow` with `{"name":"search"}`
- Typical tools: `search_jobs`, `save_search_history`, `update_job_activity`.

## `match` — Compare your matches

Evaluate requirements against your chosen CV and explain the ranking. When you ask the assistant to
choose, it can also compare your saved CVs against one offer and explain the best match.
External offers can be compared in the conversation; saved evaluations require a Hidden Jobs job ID.

> Rank these three roles using Backend English, version 3.

- Skill file: [SKILL.md](../skills/match/SKILL.md)
- MCP prompt: `match`
- Resource: `hiddenjobs://workflows/match`
- Tool instructions: `get_workflow` with `{"name":"match"}`
- Typical tools: `get_job`, `get_candidate_profile`, `list_cvs`, `get_cv`, `get_document`,
  `save_job_evaluation`.

## `apply` — Tailor an application

Draft a tailored CV and cover letter for an offer from any selected source. For Hidden Jobs offers,
preserve the base CV version and save the application. External offers can use document tools,
but are not saved in application tracking and must not be passed to tools requiring a Hidden Jobs job ID.

> Compare all my saved CVs against this offer, choose the best match and use it to prepare a
> tailored CV and cover letter.

The assistant explains its choice and preserves the selected base version. If you name a CV, it uses
that CV instead. After tailoring, it offers to save a named reusable version in Hidden Jobs,
preserving the original. Downloading or sending a document does not save that CV-library version;
the assistant uses `save_cv` after agreement and confirms the result. Application submission
depends on the client and the employer's process.

- Skill file: [SKILL.md](../skills/apply/SKILL.md)
- MCP prompt: `apply`
- Resource: `hiddenjobs://workflows/apply`
- Tool instructions: `get_workflow` with `{"name":"apply"}`
- Typical tools: `save_application`, `get_cv`, `save_document`, `save_cv`, `update_application`,
  `open_application_link`.

## `review` — Review before sending

Check facts, relevance, clarity and unsupported claims in the draft.

> Review this application against my CV and the job requirements.

- Skill file: [SKILL.md](../skills/review/SKILL.md)
- MCP prompt: `review`
- Resource: `hiddenjobs://workflows/review`
- Tool instructions: `get_workflow` with `{"name":"review"}`
- Typical tools: `get_application`, `get_document`, `save_document`, `check_document`.

## `export` — Download a PDF

Generate a PDF from a saved document and check its text and layout limits.

> Export the reviewed CV as a PDF.

- Skill file: [SKILL.md](../skills/export/SKILL.md)
- MCP prompt: `export`
- Resource: `hiddenjobs://workflows/export`
- Tool instructions: `get_workflow` with `{"name":"export"}`
- Typical tools: `get_document`, `render_document`, `check_document`, `get_document_download_url`.

## `interview` — Prepare for interviews

Practise likely questions and evidence-based answers using the offer and your experience.

> Prepare me for a first interview for this application.

- Skill file: [SKILL.md](../skills/interview/SKILL.md)
- MCP prompt: `interview`
- Resource: `hiddenjobs://workflows/interview`
- Tool instructions: `get_workflow` with `{"name":"interview"}`
- Typical tools: `get_job`, `get_company`, `get_cv`, `save_document`, `update_application`.

## `upskill` — Build a learning plan

Turn requirements you want to develop into exercises and milestones.

> Make a two-week plan to practise the SQL skills in this offer.

- Skill file: [SKILL.md](../skills/upskill/SKILL.md)
- MCP prompt: `upskill`
- Resource: `hiddenjobs://workflows/upskill`
- Tool instructions: `get_workflow` with `{"name":"upskill"}`
- Typical tools: `get_job`, `get_cv`, `get_learning_plan`, `save_learning_plan`.

## `outcome` — Track applications

Record confirmed submissions, interviews, offers, rejections and next steps.

> I submitted this application today; record it and add a follow-up note.

- Skill file: [SKILL.md](../skills/outcome/SKILL.md)
- MCP prompt: `outcome`
- Resource: `hiddenjobs://workflows/outcome`
- Tool instructions: `get_workflow` with `{"name":"outcome"}`
- Typical tools: `get_application`, `update_application`.

## `email-sync` — Review email updates

Use your separately connected email to propose application updates for your approval.

> Review job-related replies and propose status updates before saving them.

- Skill file: [SKILL.md](../skills/email-sync/SKILL.md)
- MCP prompt: `email-sync`
- Resource: `hiddenjobs://workflows/email-sync`
- Tool instructions: `get_workflow` with `{"name":"email-sync"}`
- Typical tools: `list_applications`, `get_application`, `update_application`.

## `report` — Review your progress

Summarize your pipeline, recent activity and next actions; save a report when requested.

> Show my interview-stage applications and their next steps.

- Skill file: [SKILL.md](../skills/report/SKILL.md)
- MCP prompt: `report`
- Resource: `hiddenjobs://workflows/report`
- Tool instructions: `get_workflow` with `{"name":"report"}`
- Typical tools: `get_application_report`, `list_applications`, `get_application`, `save_document`.

## `add-template` — Use your own structure

Save document structure and supported PDF layout settings.

> Save this cover-letter structure for future applications.

- Skill file: [SKILL.md](../skills/add-template/SKILL.md)
- MCP prompt: `add-template`
- Resource: `hiddenjobs://workflows/add-template`
- Tool instructions: `get_workflow` with `{"name":"add-template"}`
- Typical tools: `save_document`, `render_document`.

## `reset` — Manage saved data

Preview deletion and open your account for explicit confirmation.

> Help me remove my application history while keeping my CVs.

- Skill file: [SKILL.md](../skills/reset/SKILL.md)
- MCP prompt: `reset`
- Resource: `hiddenjobs://workflows/reset`
- Tool instructions: `get_workflow` with `{"name":"reset"}`
- Typical tools: `reset_user_data`.

## Review, submissions and external services

The apply workflow drafts and saves a tailored CV and cover letter; it does not send applications.
The review workflow performs a separate review pass. An independent reviewer agent is used only when
the client supports it and the user authorizes it.

The interview workflow uses the offer, your confirmed experience and known company facts. Practice
questions are generated by your assistant; they are not insider interview reports. Salary discussion
uses the offer's disclosed salary and your preferences, not a market maximum or comparable-salary
dataset.

The email workflow requires the client's own separately connected email service. It presents
proposed changes for approval and stores only approved references, summaries and outcomes. It does
not send email or read a mailbox through a Hidden Jobs tool.

Templates store text structure and supported PDF layout settings. Hidden Jobs does not execute
uploaded LaTeX, scripts or arbitrary CSS. Reset opens account confirmation and does not delete the account.

## Source of truth

[`src/resources/workflows.ts`](../src/resources/workflows.ts) defines the instructions served by
prompts, resources and `get_workflow`.
[`scripts/sync-career-skills.ts`](../scripts/sync-career-skills.ts) generates the portable skill
files from that source:

```bash
deno task skills:check
deno task skills:sync
```

Edit the canonical workflow and regenerate skills instead of maintaining separate instructions for
different assistants.
