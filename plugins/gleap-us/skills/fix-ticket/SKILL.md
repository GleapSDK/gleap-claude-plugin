---
name: fix-ticket
description: Fix a Gleap ticket end to end as a tracked Gleap coding session, with the plan, screenshots, PR, customer messages and a closing wrap-up visible in Gleap. Use when asked to fix, resolve, implement or work on a Gleap ticket or feature request, or when a Gleap kickoff prompt hands you a ticket to fix.
---

# Fix a Gleap ticket

The ticket is the one your operator named: a `#number`, a 24-char ticket id, or a Gleap dashboard link (the id is the 24-char segment in it). A kickoff prompt from Gleap's "Open in …" button also names the coding session ("tracked as Gleap coding session …"). If you can't tell which ticket is meant, ask before you start.

## 1. Report in and save the session file

Make this call first, before you read code:

- `report_progress` with phase `investigating`, a one-line status, `agentName` (`"Claude Code"` or `"Codex"`), and the `sessionId` from the kickoff. No session id? Pass `ticketId` (24-char id or `#number`) instead. The result names the session id; pass it on every later Gleap call.
- The result also ends with a session-file block. Write it to `.gleap/session.json` at the root of the repository you work in, exactly as given, overwriting any older file. Make it readable only by you: run `chmod 600 .gleap/session.json` right after writing it (skip this on Windows). Then make sure git ignores it: `p="$(git rev-parse --git-path info/exclude)"; mkdir -p "$(dirname "$p")"; grep -qxF '.gleap/' "$p" 2>/dev/null || echo '.gleap/' >> "$p"`. The file holds a short-lived token: never commit it, print it, or paste it anywhere else.

The plugin's hooks read that file. From then on Gleap shows the plan your todo tool keeps and, if a turn ends without a wrap-up, your last message as its recap. Without the file the hooks do nothing.

## 2. Load the workflow

Call `get_ticket` once to see the ticket type, then read the workflow in this skill's `workflows/` folder that matches it and the app you run in:

- a feature request: `workflows/feature-claude-code.md` in Claude Code, `workflows/feature-codex.md` in Codex,
- everything else (bug reports, requested changes): `workflows/fix-claude-code.md` in Claude Code, `workflows/fix-codex.md` in Codex.

Work by it for the rest of the session: it carries the steps and the rules for customer messages, branches and PRs.

## 3. Work visibly

The workflow spells these out; in short:

- **Plan.** For anything with more than two steps keep a plan and update it as you go: your own todo or plan tool (the hooks mirror it), or `update_plan` with the whole list each time and exactly one step `in_progress`.
- **Screenshots.** After a change your operator can see, run the app, check it in a browser and `share_screenshot` 1 to 3 shots with a one-line caption (`compare_with` for a before/after pair). The result gives you an upload command: run it.
- **Pages.** Reports, mockups and anything easier to read as a page go out with `publish_artifact`.
- **Blocked.** `report_progress` phase `blocked` means "waiting on you": the session shows as waiting on your operator in Gleap and does not expire. Your next report picks it back up.
- **Stopped.** A result that says the session was stopped in Gleap means stop working: wrap up and tell your operator.
- **Wrap up every turn.** Before you hand back to your operator, call `wrap_up`: the recap first (what is now true, what is not done or not verified), then at most one question with one or two actions, the recommended one first.

## Never

- Close, archive or snooze the ticket, or change its assignee, unless your operator tells you to. Once your PR is registered with `report_progress` (phase `pr_opened`), Gleap sends the fix messages and closes the ticket.
- Post status or findings as internal notes. They belong in `report_progress`.
- Commit `.gleap/`.
