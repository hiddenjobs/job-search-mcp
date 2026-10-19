# Connect Hidden Jobs

```text
Name: Hidden Jobs
URL: https://hiddenjobs.dev/mcp
Authentication: OAuth
```

Add Hidden Jobs to your AI assistant, sign in with your Hidden Jobs account and approve the
connection.

## ChatGPT and graphical clients

Add a custom remote MCP server, enter the URL above and select OAuth. Complete sign-in in your
browser.

For Cursor, add this configuration to `.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "hidden-jobs": { "url": "https://hiddenjobs.dev/mcp" }
  }
}
```

See [Cursor configuration](https://prod.cursor.com/help/customization/mcp) and
[ChatGPT connection guidance](https://developers.openai.com/api/docs/mcp).

## Claude Code

Install a current Claude Code CLI and run these commands in an interactive terminal from your
project directory.

```bash
claude mcp add --transport http hidden-jobs https://hiddenjobs.dev/mcp
claude mcp login hidden-jobs
```

Complete sign-in and approve access in your browser. If your Claude Code version does not provide
`mcp login`, start `claude`, enter `/mcp` and authenticate Hidden Jobs there. Check the server with
`claude mcp get hidden-jobs`. See [Claude Code documentation](https://code.claude.com/docs/en/mcp).

## Codex CLI

Install a current Codex CLI and run these commands in an interactive terminal.

```bash
codex mcp add hidden-jobs --url https://hiddenjobs.dev/mcp
codex mcp login hidden-jobs
```

Complete sign-in and approve access in your browser. Start `codex` and use `/mcp` to view available
servers. See [Codex documentation](https://learn.chatgpt.com/docs/extend/mcp?surface=cli).

## Use your career data

Your OAuth connection authorizes the career tools for your own account. You can start reading or
saving your profile, CVs and applications from the assistant after connecting. **Profile → Your
connections** shows the active applications using their registered OAuth names.

For example: **“Read the setup workflow and help me save my CV as Backend English.”** If a chat
attachment is not transferable by that client, upload it in Profile. The assistant can use
`get_workflow` even if the client does not show resource or prompt menus. See [skills](skills.md)
and [file transfer](career-workspace.md#cv-and-document-transfer).

The remote connection does not install `SKILL.md` files automatically. Install them separately only
when using your client's skill loader; prompts, resources and `get_workflow` provide the same
instructions through MCP.

## Try a search

“Search Hidden Jobs and Remote OK for TypeScript jobs in Europe, compare three offers and show
the source link for the best match.”

Your client can search and read job details after connecting. Retrieving an application link
for a Hidden Jobs offer requires active Hidden Jobs Access. External provider links are free. Specify the sources to search, for example “Use Hidden Jobs and Jobicy.”

## Troubleshooting

| Symptom                     | Action                                                                                         |
| --------------------------- | ---------------------------------------------------------------------------------------------- |
| Connection discovery fails  | Check the server URL and reconnect Hidden Jobs                                                 |
| Sign-in or approval expired | Restart the connection from your client                                                        |
| `401`                       | Reconnect your Hidden Jobs account                                                             |
| Application-link `402`      | Check your account's Access subscription                                                       |
| `403 connection_required`   | Reconnect your Hidden Jobs account                                                             |
| `409 revision_conflict`     | Ask the assistant to reread the record before resolving the update                             |
| `429`                       | Wait before retrying; limit is 600 authenticated tool/private-resource requests/minute/account |

Keep credentials out of prompts, logs and source control. Account access from a terminal and a
graphical client follows the same connection process.
