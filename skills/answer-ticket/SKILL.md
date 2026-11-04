---
name: answer-ticket
description: Investigate a Gleap support ticket in the code and data and answer the customer once your operator approves the text, as a tracked Gleap coding session that owns the ticket until the customer says it is solved (no code changes, no PR). Use when asked to investigate, look into, research or answer a Gleap ticket, or when a Gleap kickoff prompt hands you a ticket to answer.
---

# Answer a Gleap ticket

The ticket is the one your operator named: a `#number`, a 24-char ticket id, or a Gleap dashboard link (the id is the 24-char segment in it). A kickoff prompt from Gleap's "Open in …" button also names the coding session ("It is Gleap coding session …"). If you can't tell which ticket is meant, ask before you start.

This is an investigation, not a fix: no code changes, no commits, no pull request, no writes to production data, and nothing goes to the customer before your operator says yes to the text.

You own this ticket until the customer says it is solved. Keep working it through the customer's replies. You work for the person who runs you: when a teammate replies on the ticket or takes it over, tell your operator in one line and follow their call.

## 1. Report in and save the session file

Make this call first, before you read code:

- `report_progress` with status `working`, step `investigating`, a one-line message, `agentName` (`"Claude Code"` or `"Codex"`), and the `sessionId` from the kickoff. No session id? Pass `ticketId` (24-char id or `#number`) instead. The result names the session id; pass it on every later Gleap call that takes one, `send_message` included.
- The result also ends with a session-file block. Write it to `.gleap/session.json` at the root of the repository you work in, exactly as given, overwriting any older file. Make it readable only by you: run `chmod 600 .gleap/session.json` right after writing it (skip this on Windows). Then make sure git ignores it: `p="$(git rev-parse --git-path info/exclude)"; mkdir -p "$(dirname "$p")"; grep -qxF '.gleap/' "$p" 2>/dev/null || echo '.gleap/' >> "$p"`. The file holds a short-lived token: never commit it, print it, or paste it anywhere else. Not inside a git repository? Write it in the folder you work in and skip the exclude step.

The plugin reads that file. Its hooks show your plan in Gleap and, if a turn ends without a wrap-up, your last message as its recap. When Claude Code starts in this repository, the Gleap tools also tell Gleap which session they work for. Without the file nothing of this happens.

## 2. Continuing an earlier session

If the kickoff says you continue an earlier session ("Continue in Claude Code"), read two things first: the whole ticket thread (`get_ticket_messages`) and the last session's notes in the kickoff. The customer may have written since. Then go on from where that session stopped. Use the session id this kickoff gives you, not the earlier session's.

## 3. Load the workflow

Read the workflow in this skill's `workflows/` folder for the app you run in: `workflows/answer-claude-code.md` in Claude Code, `workflows/answer-codex.md` in Codex. Work by it for the rest of the session: it carries the steps and the rules for customer messages.

## 4. The rules in short

- **Ask before the customer hears anything.** Show your operator the exact text in this conversation: "I'd tell the customer: … Send it?" Send it with `send_message` (`isNote: false`, your `sessionId`) when they say yes. When they told you to answer, tell or update the customer, that is the yes. Never stage a reply in the ticket composer.
- **The customer wrote meanwhile.** If `send_message` is refused because the customer wrote something new, read it, adjust your reply and send it once more. Refused again: ask your operator.
- **New customer messages** listed in any Gleap result: read them before you go on.
- **Report every step** with `report_progress`: status `working` with step `investigating`. A question for your team: status `needs_input` with the question, and ask your operator here too. Once the answer is sent: status `completed` with a one-line finding.
- **STOP** in a Gleap result (only a session Gleap started on its own gets one): stop at once. No more ticket changes or customer messages. Delete `.gleap/session.json` and tell your operator in one line where you left off.
- **End with how you solved it.** Your last report carries `howSolved`: one paragraph on what was going on, what you answered and how you checked it, with no customer data. That is the report when the customer confirms it helped, or the one after your answer if your work ends there. When the ticket is solved or you hand it back, delete `.gleap/session.json`.
- **Work visibly.** Keep a plan for anything with more than two steps. A screenshot of what the customer sees goes out with `share_screenshot`, a longer finding as a page with `publish_artifact`. End every turn with `wrap_up`: the recap first (what you found, what is not verified), then at most one question with one or two actions.

## Never

- Message the customer before your operator said yes to the text.
- Write into the ticket composer. Ask your operator here, then send.
- Close, archive or snooze the ticket, or change its assignee, unless your operator tells you to.
- Commit `.gleap/`.
