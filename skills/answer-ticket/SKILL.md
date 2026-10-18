---
name: answer-ticket
description: Investigate a Gleap support ticket in the code and data and draft the answer for the support team, as a tracked Gleap coding session (no code changes, no PR). Use when asked to investigate, look into, research or answer a Gleap ticket, or when a Gleap kickoff prompt hands you a ticket to answer.
---

# Answer a Gleap ticket

The ticket is the one your operator named: a `#number`, a 24-char ticket id, or a Gleap dashboard link (the id is the 24-char segment in it). A kickoff prompt from Gleap's "Open in …" button also names the coding session ("tracked as Gleap coding session …"). If you can't tell which ticket is meant, ask before you start.

This is an investigation, not a fix: no code changes, no commits, no pull request, no writes to production data, and nothing sent to the customer unless your operator tells you to send it.

## 1. Report in and save the session file

Make this call first, before you read code:

- `report_progress` with phase `investigating`, a one-line status, `agentName` (`"Claude Code"` or `"Codex"`), and the `sessionId` from the kickoff. No session id? Pass `ticketId` (24-char id or `#number`) instead. The result names the session id; pass it on every later Gleap call.
- The result also ends with a session-file block. Write it to `.gleap/session.json` at the root of the repository you work in, exactly as given, overwriting any older file. Then make sure git ignores it: `p="$(git rev-parse --git-path info/exclude)"; mkdir -p "$(dirname "$p")"; grep -qxF '.gleap/' "$p" 2>/dev/null || echo '.gleap/' >> "$p"`. The file holds a short-lived token: never commit it, print it, or paste it anywhere else. Not inside a git repository? Write it in the folder you work in and skip the exclude step.

The plugin's hooks read that file. From then on Gleap shows the plan your todo tool keeps and, if a turn ends without a wrap-up, your last message as its recap. Without the file the hooks do nothing.

## 2. Load the workflow

Call `get_agent_workflow` with the session id and `kind: "answer"`, and follow the markdown it returns as your instructions for the rest of the session. If its result carries a session-file block too, write that one to `.gleap/session.json` instead.

`get_agent_workflow` missing (an older Gleap MCP server)? Read the hosted copy instead: `https://gleap.io/agent-setup/claude-code-answer.md` for Claude Code, `https://gleap.io/agent-setup/codex-answer.md` for Codex.

## 3. Work visibly

The workflow spells these out; in short:

- **Plan.** For anything with more than two steps keep a plan and update it as you go: your own todo or plan tool (the hooks mirror it), or `update_plan` with the whole list each time and exactly one step `in_progress`.
- **Evidence.** A screenshot that shows what the customer sees goes out with `share_screenshot` (one-line caption; run the upload command the result gives you). A longer write-up, like a timeline or a data breakdown, goes out as a page with `publish_artifact`. `get_ticket_screenshot` shows you the screenshot the customer's report came with.
- **Blocked.** `report_progress` phase `blocked` means "waiting on you": the session shows as waiting on your operator in Gleap and does not expire. Your next report picks it back up.
- **Stopped.** A result that says the session was stopped in Gleap means stop working: wrap up and tell your operator.
- **Wrap up every turn.** Before you hand back to your operator, call `wrap_up`: the recap first (what you found, what is not verified), then at most one question with one or two actions, the recommended one first. Use `send_customer_update` with your draft as `message` when the next move is sending the answer.

## Never

- Message the customer on your own. Draft the reply into the ticket composer with `draft_reply_to_composer`; send it with `send_message` only when your operator tells you to.
- Close, archive or snooze the ticket, or change its assignee, unless your operator tells you to.
- Commit `.gleap/`.
