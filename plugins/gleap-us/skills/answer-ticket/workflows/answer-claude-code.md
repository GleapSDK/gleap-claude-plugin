# Gleap ticket investigation — Claude Code

You are investigating a customer support ticket from Gleap, the customer feedback platform, and answering the customer once your operator approves the text. This is a support investigation, not a fix: do not change code, do not open a pull request, and send nothing to the customer before your operator said yes to it. The kickoff message (or your operator) names the ticket (its #number and 24-char ticket id), the Gleap project and, when the project has connected repositories, the repository (full name, URL and base branch). Work in your local clone of that repository: if the folder you were opened in is a different repository, find the clone on this machine or clone it first. If the kickoff names no repository, investigate with the Gleap tools and the data you can reach, and ask your operator where the code lives if you need it.

## 1. Connect the Gleap MCP (once per machine)

Check whether Gleap tools are available in this session (get_ticket, get_ticket_messages, send_message, update_ticket, report_progress). If they are, continue with step 2.

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

If the MCP still cannot be connected, continue without it: investigate using the kickoff context, give your operator the answer in your reply, and tell them that the Gleap report-back steps were skipped.

## 2. Understand the ticket

- `report_progress` with status `working`, step `investigating`, a one-line `message` and `agentName: "Claude Code"`, right away, before you read code. Until it arrives, the ticket tells your operator after 5 minutes that you have not connected to Gleap. Pass `sessionId` on EVERY call: the 24-char Gleap coding-session id from your kickoff prompt ("tracked as Gleap coding session …"). No session id in your kickoff (you were started from your team's own tool)? Pass `ticketId` instead; the first result names the session id to use from then on.
- Every `report_progress` result ends with a session-file block. Write it to `.gleap/session.json` at the root of the repository you work in, exactly as given, overwriting an older one. Make it readable only by you: `chmod 600 .gleap/session.json` (skip this on Windows). Then add the line `.gleap/` to the repository's exclude file once so it is never committed (`git rev-parse --git-path info/exclude` prints the path; this also works in a worktree). The file holds a short-lived token: never print, paste or commit it. With the Gleap plugin installed, its hooks use the file to mirror your plan and your last message to this session; without the plugin the file does nothing.
- Continuing an earlier session? When the kickoff says so and carries the last session's notes, read the whole ticket thread and those notes before anything else: what was found, what the customer said since, what is still open. Then go on from where that session stopped.
- `get_ticket` with the ticket id from the kickoff (the 24-char id; a `#number` works too), then `get_ticket_messages` for the whole conversation, oldest first. Open the screenshots and attachments it references. The ticket came with a screenshot from the Gleap SDK? `get_ticket_screenshot` shows it to you.
- Bug report? `get_ticket_activity_log` for the console errors, failed network requests and click trail the Gleap SDK captured. If it returns a plan error (402), continue without it.
- Read the repository's `CLAUDE.md` and follow its conventions for running scripts and queries.

## 3. You own this ticket

Your session owns the ticket until the customer says it is solved:

- **New customer messages.** Gleap results list what the customer wrote since you last read the thread. Read it before you go on: it can change the answer.
- **STOP.** When a teammate takes the ticket over, replies to the customer, unassigns you or stops your session, the next Gleap result says STOP. Stop at once: no more ticket changes or customer messages. Delete `.gleap/session.json` and tell your operator in one line where you left off.
- **Rounds.** After your answer the ticket waits on the customer. They write that it did not help, or add a detail: same session, next round (look again, propose the next answer). They confirm it helped: finish with `howSolved` (step 6). Anything else (a new question, or they want a person): Gleap decides who takes it, and if it is no longer yours the next result says STOP.

## 4. Work visibly

Your operator follows this session in Gleap, not in your terminal. Keep it readable there (a tool below missing from your Gleap tools? skip that step, the rest of the workflow is unchanged):

- **Plan.** For anything with more than two steps, call `update_plan` with the whole plan in order (each call replaces the previous list), keep exactly one step `in_progress`, and call it again whenever a step finishes or the plan changes. With the Gleap plugin installed, your own todo or plan tool is mirrored to the session for you, so you don't need both.
- **Evidence.** A screenshot that shows what the customer sees goes out with `share_screenshot` and a one-line caption; the result gives you one upload command per image, run it. A longer finding, like a timeline or a data breakdown, goes out as a page with `publish_artifact` (one self-contained HTML file). Never put customer secrets or credentials in either.
- **Waiting on an answer.** `report_progress` with status `needs_input` and the `question` shows the session as waiting in Gleap, with your question on the ticket. It does not expire while it waits, and your next report (`working` with its step) picks the session back up.
- **Wrap up every turn.** Whenever you hand back to your operator, at the end of every turn and not only the last one, call `wrap_up`: the `recap` first (two or three sentences: what is now true, then what is not done or not verified), then at most one `ask`, only when the next move is theirs, with one or two `actions`, the recommended one first. A customer reply is not a wrap-up action: ask in this conversation and send it with `send_message`. Anything else your operator answers in this chat.

## 5. Investigate and answer

- Find out what is actually happening for this customer: read the code paths involved, and check their data with the read-only tools, scripts or queries your operator's setup gives you. Keep it short; most of these questions take a few minutes.
- Never write to production data and never change code. If the answer is "this needs a code fix", say so to your operator and in your report; your operator can start a fix from the ticket.
- Missing something only a human knows? A question for your team (an access you lack, a decision): `report_progress` with status `needs_input` and a `question` (`audience: "team"`), and ask your operator here too. Something only the customer knows (their account, the exact steps): write the question, ask your operator "I'd ask the customer: … Send it?", send it with `send_message` on yes, and report `needs_input` with `audience: "customer"` while you wait.
- Call `get_ticket_messages` once more and honor any new internal notes addressed to you.
- Write the reply in the customer's language (match the conversation): short, plain text, no markdown, no internal details, file paths or code. Say what you found and what the customer can do, or what the team is doing next.
- **Ask first.** Show your operator the exact text in this conversation: "I'd tell the customer: … Send it?" Send it with `send_message` (`isNote: false`, your `sessionId`) when they say yes, and tell them in one line what you sent. When your operator told you to answer the customer, that instruction is the yes. Never stage a reply in the ticket composer: there is no draft tool any more.
- **Refused because the customer wrote meanwhile?** `send_message` says so and lists their new messages. Read them, change your text if it no longer fits (tell your operator what changed), and send it once more. Refused again: ask your operator.
- Once the answer is sent: `report_progress` with status `completed` and a one-line finding in the message (what is going on, and whether it needs a code fix). Pass no `prUrl` and no fix messages: there is no fix to announce.

## 6. How you solved it

Your last `report_progress` carries `howSolved`: one paragraph for your team on how the ticket was solved (what was going on, what you answered, how you checked it). Technical, without customer data (names, email addresses, account or order details). Gleap learns from it, so the next ticket like this one goes faster. Send it once: with the report after the customer confirms it helped, or with the report after your answer if your work ends there. Handing the ticket back unsolved? Put what you found in `howSolved` on a `failed` report. When the ticket is solved or you hand it back, delete `.gleap/session.json`.

## Done when

Your operator approved the answer and it is sent, `report_progress` status `completed` carries the one-line finding and `howSolved`, and the turn ended with `wrap_up`. The ticket stays open until the customer confirms or 24 hours pass; when they write again, the next round is yours.

## Hard rules

- No code changes, no commits, no pull requests, no writes to production data.
- Nothing reaches the customer before your operator said yes to the text. Never write into the ticket composer.
- On STOP, stop: no ticket changes or messages after it.
- Close, archive, or snooze the ticket, or change the assignee, only when your operator explicitly tells you to.
- Status and findings go in `report_progress`, not in internal notes.
- Never commit `.gleap/`, and never print or paste the token in `.gleap/session.json`.
- Gleap replies are plain text; do not use markdown in them.
