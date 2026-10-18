# Gleap for Claude Code and Codex

Work your [Gleap](https://www.gleap.ai) support queue from your coding agent: triage tickets, look up customers, draft replies grounded in your help center, and fix or answer tickets as a tracked Gleap coding session, with your plan, screenshots and a closing wrap-up visible to your team in Gleap.

This repository is a plugin marketplace named `gleap` with two plugins. Install the one that matches where your Gleap workspace is hosted, not both:

| Plugin | Region | MCP server |
|---|---|---|
| `gleap` | EU | `https://mcp.gleap.io/mcp` |
| `gleap-us` | US | `https://mcp.us.gleap.ai/mcp` |

Both have the same skills and hooks.

## Install in Claude Code

From your shell:

```
claude plugin marketplace add GleapSDK/gleap-claude-plugin
claude plugin install gleap@gleap
```

US workspaces install `gleap-us@gleap` instead. Inside a session, `/plugin marketplace add GleapSDK/gleap-claude-plugin` followed by `/plugin install gleap@gleap` does the same, and on Claude Code 2.1.275 or later one line is enough:

```
/plugin install gleap --marketplace GleapSDK/gleap-claude-plugin
```

Start a new session (or run `/reload-plugins`), then open `/mcp`, select the plugin's `gleap` server and choose **Authenticate**. Your browser opens for the OAuth sign-in: sign in and pick the Gleap project. No API key.

Already added the Gleap MCP server yourself with `claude mcp add`? If the tools show up twice, remove your own copy with `claude mcp remove gleap --scope user`.

Updates: third-party marketplaces don't auto-update by default. Turn it on under `/plugin` → **Marketplaces** → `gleap` → **Enable auto-update**, or run `claude plugin update gleap@gleap`.

## Install in Codex

From your shell:

```
codex plugin marketplace add GleapSDK/gleap-claude-plugin
codex plugin add gleap@gleap
```

US workspaces add `gleap-us@gleap` instead. In the ChatGPT desktop app, add the marketplace the same way and open `codex://plugins/install/gleap?marketplace=gleap` (or browse **Plugins**); in the Codex CLI, `/plugins` opens the plugin browser. Start a new session afterwards.

Codex doesn't run plugin hooks until you trust them: run `/hooks` in the CLI and trust the three Gleap hooks. Trust is tied to the exact hook definition, so Codex asks again when a plugin update changes a hook.

Sign-in: the plugin bundles the Gleap MCP server as `gleap`. If Codex doesn't prompt you to sign in, run `codex mcp login gleap`. (The Codex docs don't yet say how OAuth for a plugin-bundled server is started from the CLI; the desktop app signs in on install.)

## What's included

**MCP server.** The hosted Gleap MCP server for your region: tickets, contacts, companies, CRM pipelines, help center, surveys, feature requests, analytics, and the coding-session tools (`report_progress`, `update_plan`, `share_screenshot`, `publish_artifact`, `wrap_up`, `get_agent_workflow`, `get_ticket_screenshot`). Read tools are annotated read-only; anything that creates, updates or deletes asks first.

**Skills**

| Skill | What it does |
|---|---|
| `fix-ticket` | Fixes a ticket or builds a feature request as a tracked Gleap coding session: reports in, saves the session file, loads the project's workflow with `get_agent_workflow`, keeps a plan, shares screenshots, opens the PR and ends each turn with `wrap_up`. |
| `answer-ticket` | Investigates a ticket in the code and data and drafts the answer into the ticket composer, as a tracked session. No code changes, no PR. |
| `triage-inbox` | Ranks the open queue by what costs most if it waits, clusters tickets sharing a root cause, and proposes owners and priorities. |
| `draft-support-reply` | Reads the full thread and the customer's history, grounds the answer in your help center, and drafts a reply in the customer's language. |

In Claude Code they run as `/gleap:fix-ticket 1234` (or `/gleap-us:…`), or Claude picks them up when you ask it to fix or answer a Gleap ticket. In Codex, ask for it ("fix Gleap ticket #1234") or pick the skill.

**Hooks.** Three hooks run `scripts/gleap-hook.mjs` (Node 18 or later, no dependencies):

| Event | Claude Code | Codex | Sends |
|---|---|---|---|
| After the agent updates its plan | `PostToolUse` on `TodoWrite`, `TaskCreate`, `TaskUpdate` | `PostToolUse` on `update_plan` | the plan items (text and status) |
| When a turn ends | `Stop` | `Stop` | the agent's last message, at most 4,000 characters |
| When a session starts or resumes | `SessionStart` | `SessionStart` | nothing but "still here" |

Gleap uses the plan for the live checklist on the session, and the last message as the turn's recap when the agent ended a turn without calling `wrap_up` (an agent's own `wrap_up` always wins).

## What the hooks send, and when

The hooks do nothing unless the folder you work in has a `.gleap/session.json`. The agent writes that file only for a session started from Gleap: the `report_progress` and `get_agent_workflow` results hand it a session id, a short-lived token (48 hours, scoped to that one session's plan and wrap-up) and the API address, and the `fix-ticket` / `answer-ticket` skills and the Gleap workflows tell it to save them there and add `.gleap/` to `.git/info/exclude`.

With the file present, and only then:

- The script looks for `.gleap/session.json` from the hook's working directory up to the repository root, and nowhere else.
- It sends the plan items or the last assistant message (as above) to `POST <api>/v3/kai-agent-hooks/plan`, `/stop` or `/session-start`, with the token as a Bearer header. Nothing else from your session: no code, no file contents, no tool output, no transcript.
- It only talks to Gleap hosts (`*.gleap.io`, `*.gleap.ai` over HTTPS), so a `session.json` planted in a repository can't send your plan anywhere else. An expired token is ignored.
- It never blocks or fails your agent: every request has a 2-second timeout and the script ends within 3.5 seconds, errors are swallowed, the script always exits 0 and prints nothing your agent sees (Codex's `Stop` gets an empty `{}`, which it requires).
- For Claude Code's task tools it keeps a small per-session list in `.gleap/hook-tasks-<session>.json` so each update can send the whole plan; files older than seven days are removed.

To stop the hooks for one repository, delete its `.gleap/` folder. To stop them everywhere, uninstall or disable the plugin.

For local development against a Gleap server on `localhost`, set `GLEAP_HOOK_ALLOW_LOCAL=1` in the agent's environment; `GLEAP_HOOK_DEBUG=1` prints one line per request to stderr (never the token).

## Remove

Claude Code:

```
claude plugin uninstall gleap@gleap
claude plugin marketplace remove gleap
```

Removing the marketplace also uninstalls its plugins. To keep the plugin but switch it off, `claude plugin disable gleap@gleap`.

Codex:

```
codex plugin remove gleap@gleap
codex plugin marketplace remove gleap
```

Use `gleap-us@gleap` for the US plugin. Any `.gleap/` folders the agent wrote stay in your repositories until you delete them; they are excluded from git.

## Examples

- "Fix Gleap ticket #1234."
- "Look into ticket 143790 and draft an answer."
- "Triage the Gleap inbox and tell me what needs attention today."
- "Find the contact for sarah@acme.com and summarize her recent tickets."
- "What was our average first response time last month compared to the month before?"

## Requirements

A Gleap account with at least one project. Node.js 18 or later on the machine for the hooks (the skills and MCP server work without it).

## Privacy Policy

Gleap's privacy policy is at **https://www.gleap.ai/legal/privacy-policy**.

**What is collected.** The MCP server receives only the arguments of the tool calls your agent makes (search terms, ticket and contact identifiers, and any content you ask it to write), plus the OAuth token identifying your workspace. The hooks send only what is listed under [What the hooks send](#what-the-hooks-send-and-when), and only for sessions started from Gleap. Neither reads your conversation history, your agent's memory, or local files beyond `.gleap/session.json`.

**How it is used and stored.** Requests are served by the Gleap API against your own workspace data and are subject to the same retention as the rest of your Gleap account. Plan items and recaps are stored on the Gleap coding session they belong to.

**Third-party sharing.** None beyond the subprocessors already listed in Gleap's privacy policy and Data Processing Agreement.

**Retention.** Workspace data follows your Gleap account's retention settings. OAuth tokens persist until you revoke them, from Gleap → Settings, or by disconnecting the connector. Hook tokens expire after 48 hours.

**Contact.** support@gleap.io

## Development

`plugins/gleap-us/` is generated from the repository root: edit the root files, then run `node dev/sync-us-plugin.mjs` (`--check` fails when the copy is stale). `node --test dev/hook-smoke.test.mjs` runs the hook script against a local HTTP server. `claude plugin validate .` checks the Claude Code manifests.

## Support

- Setup guide: https://help.gleap.io/en/articles/191-connecting-to-the-gleap-mcp-server
- Gleap MCP overview: https://www.gleap.ai/mcp
- Email: support@gleap.io

## License

MIT
