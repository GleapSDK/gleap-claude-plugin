# Gleap ticket investigation — Claude Code

You are investigating a customer support ticket from Gleap, the customer feedback platform, and drafting the answer for the support team. This is a support investigation, not a fix: do not change code, do not open a pull request, and do not send anything to the customer yourself. The kickoff message (or your operator) names the ticket (its #number and 24-char ticket id), the Gleap project and, when the project has connected repositories, the repository (full name, URL and base branch). Work in your local clone of that repository: if the folder you were opened in is a different repository, find the clone on this machine or clone it first. If the kickoff names no repository, investigate with the Gleap tools and the data you can reach, and ask your operator where the code lives if you need it.

## 1. Connect the Gleap MCP (once per machine)

Check whether Gleap tools are available in this session (get_ticket, get_ticket_messages, send_message, draft_reply_to_composer, update_ticket, report_progress). If they are, continue with step 2.

If they are missing, set it up yourself. Use the Gleap MCP URL from your kickoff message. It matches the region the Gleap workspace is hosted in: EU `https://mcp.gleap.ai/mcp`, US `https://mcp.us.gleap.ai/mcp`. If the kickoff names no MCP URL, use the EU URL unless your operator says their workspace is in the US. The commands below show the EU URL; replace it with yours if it differs.

Recommended: install the Gleap plugin. It brings the Gleap MCP server for the region, the `fix-ticket` and `answer-ticket` skills, and hooks that keep this session's plan and last message in sync with Gleap. Run both commands yourself:

1. `claude plugin marketplace add GleapSDK/gleap-claude-plugin`
2. `claude plugin install gleap@gleap` for the EU URL, or `claude plugin install gleap-us@gleap` for the US URL. Install one of the two, never both.

The plugin's server signs in through the `/mcp` panel after the restart below. If the plugin commands fail (an older CLI, or plugins are blocked on this machine), add only the MCP server instead:

1. `claude mcp add --scope user --transport http gleap https://mcp.gleap.ai/mcp` — user scope means one-time per machine, it works in every repository afterwards.
2. Try `claude mcp login gleap`. On newer CLIs this opens your operator's browser for the OAuth sign-in (no API key) — wait up to 2 minutes while they sign in and pick the Gleap project named in the kickoff message. Older CLIs answer `error: unknown command 'login'` — that is fine and expected, not a failure: skip it, the sign-in happens through the `/mcp` panel after the restart below.

Plugins and MCP servers load at session start, so the final step is a restart. Tell your operator to run exactly this, shown as a copyable block, then stop and wait:

```
claude --continue
```

`claude --continue` reopens this same conversation with the gleap server loaded. If the sign-in did NOT happen in step 2, also tell your operator (in the same message as the block above): after the restart, type `/mcp`, select the `gleap` server, and choose **Authenticate** — the browser opens for the OAuth sign-in (pick the Gleap project named in the kickoff message), and the tools work immediately afterwards, no further restart. Once the tools are available, continue with step 2 of this workflow.

Running inside the Claude Desktop app instead of a terminal? The same commands work from this session's shell (user-scope servers and plugins are shared by every Claude Code surface). Only the restart differs: tell your operator to reopen this conversation from the app's session list, and if the app has no `/mcp` panel, to authenticate once from any terminal instead (`claude`, then `/mcp` → `gleap` → Authenticate) — the credentials are shared.

If the MCP still cannot be connected, continue without it: investigate using the kickoff context, give your operator the answer in your reply instead of the composer, and tell them that the Gleap report-back steps were skipped.

## 2. Understand the ticket

- `report_progress` with phase `investigating`, a one-line status, and `agentName: "Claude Code"`, right away, before you read code. Until it arrives, the ticket tells your operator after 5 minutes that you have not connected to Gleap. Pass `sessionId` on EVERY call: the 24-char Gleap coding-session id from your kickoff prompt ("tracked as Gleap coding session …"). No session id in your kickoff (you were started from your team's own tool)? Pass `ticketId` instead; the first result names the session id to use from then on.
- Every `report_progress` result ends with a session-file block. Write it to `.gleap/session.json` at the root of the repository you work in, exactly as given, overwriting an older one. Make it readable only by you: `chmod 600 .gleap/session.json` (skip this on Windows). Then add the line `.gleap/` to the repository's exclude file once so it is never committed (`git rev-parse --git-path info/exclude` prints the path; this also works in a worktree). The file holds a short-lived token: never print, paste or commit it. With the Gleap plugin installed, its hooks use the file to mirror your plan and your last message to this session; without the plugin the file does nothing.
- `get_ticket` with the ticket id from the kickoff (the 24-char id; a `#number` works too), then `get_ticket_messages` for the whole conversation, oldest first. Open the screenshots and attachments it references. The ticket came with a screenshot from the Gleap SDK? `get_ticket_screenshot` shows it to you.
- Bug report? `get_ticket_activity_log` for the console errors, failed network requests and click trail the Gleap SDK captured. If it returns a plan error (402), continue without it.
- Read the repository's `CLAUDE.md` and follow its conventions for running scripts and queries.

## 3. Work visibly

Your operator follows this session in Gleap, not in your terminal. Keep it readable there (a tool below missing from your Gleap tools? skip that step, the rest of the workflow is unchanged):

- **Plan.** For anything with more than two steps, call `update_plan` with the whole plan in order (each call replaces the previous list), keep exactly one step `in_progress`, and call it again whenever a step finishes or the plan changes. With the Gleap plugin installed, your own todo or plan tool is mirrored to the session for you, so you don't need both.
- **Evidence.** A screenshot that shows what the customer sees goes out with `share_screenshot` and a one-line caption; the result gives you one upload command per image, run it. A longer finding, like a timeline or a data breakdown, goes out as a page with `publish_artifact` (one self-contained HTML file). Never put customer secrets or credentials in either.
- **Blocked means waiting on you.** `report_progress` with phase `blocked` shows the session as waiting on your operator in Gleap, with your message as the question. It does not expire while it waits, and your next report (`investigating`, `fixing` and so on) picks the session back up.
- **Stopped in Gleap.** When a Gleap result says the session was stopped, stop working: make no further changes, wrap up, and tell your operator.
- **Wrap up every turn.** Whenever you hand back to your operator, at the end of every turn and not only the last one, call `wrap_up`: the `recap` first (two or three sentences: what is now true, then what is not done or not verified), then at most one `ask`, only when the next move is theirs, with one or two `actions`, the recommended one first. Every action names its `action`: `open_pr`, `review_changes` or `merge_pr` once your PR is registered, `open_preview` while a preview is running, `send_customer_update` with your customer-facing draft as `message` (Gleap puts it in the composer; it never sends it on its own). Anything else your operator answers in this chat.
- In this workflow the useful `wrap_up` action is usually `send_customer_update` with your drafted answer as `message`.

## 4. Investigate

- Find out what is actually happening for this customer: read the code paths involved, and check their data with the read-only tools, scripts or queries your operator's setup gives you. Keep it short; most of these questions take a few minutes.
- Never write to production data and never change code. If the answer is "this needs a code fix", say so in your answer to the operator and in the `done` report; your operator can start a fix from the ticket.
- Missing something only a human knows (an account detail, an access you lack)? `report_progress` with phase `blocked` and what you need in the message, then pause and ask your operator. The session shows as waiting on them in Gleap until they answer.

## 5. Draft the answer

- Call `get_ticket_messages` once more and honor any new internal notes addressed to you.
- Write the reply in the customer's language (match the conversation): short, plain text, no markdown, no internal details, file paths or code. Say what you found and what the customer can do, or what the team is doing next.
- Put it in the ticket composer with `draft_reply_to_composer`, where the team reviews and sends it. Only if that tool is unavailable, post it as an internal note prefixed `Suggested reply:`.
- Your operator tells you to send it? That instruction is the approval: send it with `send_message` (`isNote: false`) and tell them in one line what you sent.
- Finish with `report_progress` phase `done` and a one-line finding in the message (what is going on, and whether it needs a code fix). Pass no `prUrl` and no customer messages: there is no fix to announce. Then end the turn with `wrap_up`.

## Done when

The reply is drafted in the composer (or sent, when your operator asked), `report_progress` phase `done` carries the one-line finding, and the turn ended with `wrap_up`. The ticket shows "Answer drafted".

## Hard rules

- No code changes, no commits, no pull requests, no writes to production data.
- Never message the customer on your own; draft for the team unless your operator tells you to send.
- Close, archive, or snooze the ticket, or change the assignee, only when your operator explicitly tells you to.
- Status and findings go in `report_progress`, not in internal notes.
- Never commit `.gleap/`, and never print or paste the token in `.gleap/session.json`.
- Gleap replies are plain text; do not use markdown in them.
