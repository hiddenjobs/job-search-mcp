# Contributing

## Sending a change

Fork the repository if you do not have write access. Create a branch for each change, for example
`git switch -c fix/resource-errors`, then open a pull request targeting `main`.

Pull requests must be up to date with `main`, have resolved review conversations, and pass both
GitHub Actions checks: **Lint and formatting** and **Tests and coverage**.
Only `hiddenjobs` can merge a pull request without another maintainer's approval. Everyone else
needs one approving maintainer review; new commits dismiss earlier approvals.
For example, `hiddenjobs` can merge its own PR after CI passes, while another contributor must
obtain approval first. This exception never bypasses CI or permits direct pushes to `main`.
Direct pushes, force pushes and deletion of `main` are blocked for everyone, including administrators.
Approved pull requests merge with squash, and GitHub deletes the source branch afterwards.

Keep changes focused and describe the problem, resulting behavior and validation in the pull request.

## Development checks

Install Node.js 22 and Deno 2, then run the checks used by CI:

```bash
npm ci
deno task fmt
deno task lint
deno task check
deno task coverage
deno task docs:check
deno task skills:check
```

CI runs **ESLint + typescript-eslint** with `strictTypeChecked` and `stylisticTypeChecked`,
and **Prettier**, as a separate check on every pull request and push to `main`.
Warnings fail CI. Typed rules reject unsafe JSON access, unhandled promises, non-null assertions
and other error-prone constructs. For example, check that a lookup returned a tool before using
its schema; do not force it with `tool!`. ESLint handles code quality and Prettier handles formatting.
Run `npm run lint:fix` and `deno task fmt:fix` to apply automatic corrections, then review the diff.
Versions are pinned in `package-lock.json`; these tools are development dependencies only.
Prettier checks TypeScript, configuration, Markdown and Actions workflows. Generated skills and
the Deno lockfile retain their canonical generator format and have their own consistency checks.

`deno task coverage` runs the tests and requires at least **95% lines, 90% branches and 95%
functions**, both overall and in every TypeScript file in `src/`. Tests and maintenance scripts do
not contribute to those percentages. Every source file must appear in the report, including new
modules; missing coverage fails CI. For example, a file with 94% line coverage fails even if the
repository average is 99%. Add meaningful behavior tests rather than excluding production code.
GitHub Actions publishes HTML and LCOV reports as the `coverage` artifact for 14 days, including
when the threshold check fails. For a quick test run without coverage, use `deno task test`.

Tests exercise the actual REST-backed handler with request-scoped HTTP fixtures. They cover OAuth
challenges, every tool mapping, denied operations and resources/prompts without customer accounts.
Token verification, backend and database tests run in the Hidden Jobs application repository.

The README and guides describe the complete career workflow: setup, search, ranking, tailored CVs
and letters, review, export, interviews and tracking. Keep tool arguments and examples aligned with
the domain files in `src/tools/` and their registry `src/tools/index.ts`, and resources/prompts/skills aligned with
`src/resources/workflows.ts`. Change that canonical file and regenerate skills rather than editing
generated `SKILL.md` files by hand.

For example, adding a workflow requires its portable skill, prompt/resource entry and documentation
example to agree. Do not present preparation as submission, client file attachments as automatic
uploads, or assistant assessments as company facts.

For a live discovery check, run `deno task smoke`. See
[integration development](docs/development.md) for repository boundaries and the optional
authenticated check. For example, a change to an authentication error should include a protocol test
showing the expected status and OAuth challenge.

Keep changes focused. Update documentation when tool schemas, responses or protocol behavior change.
Database tables, storage implementation and deployment configuration belong to the Hidden Jobs
application repository. Include the reason for the change and the checks run in your pull request.
Never include credentials, private application URLs or customer data.

## Code layout

```text
src/
  index.ts                 Public entry point and REST wiring
  server.ts                HTTP/JSON-RPC dispatch and OAuth challenges
  errors.ts                Shared operation errors
  api/
    client.ts              Request-bound HTTP client
    routes.ts              Tool-to-REST mappings
  tools/
    index.ts               Tool catalogue
    alerts.ts              Email alert tools and filter values
    jobs.ts                Job search, detail and company tools
    profile.ts             Candidate profile
    cvs.ts                 CV versions and selection
    documents.ts           Documents, uploads and file limits
    applications.ts        Application records and states
    activity.ts            Search history, evaluations and learning plans
    account.ts             Workflow discovery, reports, export and reset
    schemas.ts             Shared schema definitions
    validation.ts          Tool argument validation
  resources/
    index.ts               Resources and prompts
    workflows.ts           Canonical workflow instructions
tests/                     Behavior tests and shared request fixtures
skills/                    Generated portable skills
scripts/                   Documentation, skills and connection checks
```

Use one execution path through REST. For example, a private CV resource calls `get_cv` through the
same request-bound client as the tool. Avoid backend-auth callbacks or a second server
implementation. Prefer explicit dependency injection to global mocks; keep the built-in Deno test
runner and standard assertions.
