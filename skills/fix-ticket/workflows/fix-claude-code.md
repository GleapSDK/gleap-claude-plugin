# Gleap ticket workflow — Claude Code

You are resolving a customer support ticket from Gleap, the customer feedback platform. The kickoff message (or your operator) names the ticket (its #number and 24-char ticket id) and the Gleap project. It defines WHICH ticket; the live ticket you fetch below is the source of truth for WHAT is wrong. The kickoff also names the repository (full name, URL and base branch). Work in your local clone of it: if the folder you were opened in is a different repository, find the clone on this machine or clone it first. If the kickoff names no repository or several, and it is unclear where the change belongs, ask before starting.

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

If the MCP still cannot be connected, continue without it: investigate and fix using the kickoff context, and tell your operator that the Gleap report-back steps were skipped.

## 2. Understand the ticket

- `get_ticket` with the ticket id from the kickoff message (the 24-char id; a `#number` works too). The same id is what the mutation tools below require.
- `report_progress` with phase `investigating`, a one-line status, and `agentName: "Claude Code"` — then again at every phase change (`reproduced`, `fixing`, `blocked`, `pr_opened`, `done`). The `message` is where the detail belongs: on `blocked` say what you need from a human, on `done` give a one-line root cause and fix. Also pass `sessionId` on EVERY call — the 24-char Gleap coding-session id from your kickoff prompt ("tracked as Gleap coding session …"); every report lands on that session, which is what the ticket's status bubble, list glyphs and merge automation render. No session id in your kickoff (you were started from your team's own tool, not Gleap's "Open in …" button)? Pass `ticketId` (the 24-char id or #number) instead: Gleap continues the ticket's coding session or starts one, and the first result names the session id to pass from then on. This is your status surface: it updates the ticket's live activity badge and never posts a message, so call it on transitions only. Make the first `investigating` call right away, before you read the code: until it arrives, the ticket tells your operator after 5 minutes that you have not connected to Gleap. A report after a long pause is fine; it reopens a session that closed after 24 hours without one.
- Every `report_progress` result ends with a session-file block. Write it to `.gleap/session.json` at the root of the repository you work in, exactly as given, overwriting an older one. Make it readable only by you: `chmod 600 .gleap/session.json` (skip this on Windows). Then add the line `.gleap/` to the repository's exclude file once so it is never committed (`git rev-parse --git-path info/exclude` prints the path; this also works in a worktree). The file holds a short-lived token: never print, paste or commit it. With the Gleap plugin installed, its hooks use the file to mirror your plan and your last message to this session; without the plugin the file does nothing.
- `get_ticket_messages` for the full conversation, oldest first. Open screenshots and attachments it references. The ticket came with a screenshot from the Gleap SDK? `get_ticket_screenshot` shows it to you.
- Bug report? `get_ticket_activity_log` with the same ticket id before you try to reproduce: the console errors, failed network requests and the user's click trail that the Gleap SDK captured with the report (redacted; long logs are trimmed with errors and failed requests kept first, and `section` or `search` shows more). Start from the first error or failed request instead of guessing. If it returns a plan error (402), continue without logs.
- Read the repository's `CLAUDE.md` and follow its conventions.
- Missing key information to reproduce? Call `report_progress` with phase `blocked` and put what you need in the message, then pause. Do not guess.

## 3. Work visibly

Your operator follows this session in Gleap, not in your terminal. Keep it readable there (a tool below missing from your Gleap tools? skip that step, the rest of the workflow is unchanged):

- **Plan.** For anything with more than two steps, call `update_plan` with the whole plan in order (each call replaces the previous list), keep exactly one step `in_progress`, and call it again whenever a step finishes or the plan changes. With the Gleap plugin installed, your own todo or plan tool is mirrored to the session for you, so you don't need both.
- **Screenshots.** After a change your operator can see, start the app (the repository's `.claude/launch.json` or `.gleap/dev.yaml` names the dev server when it has one), check the change in a browser, and `share_screenshot` 1 to 3 screenshots, each with a one-line caption. Pass `compare_with` with a screenshot from before the fix to show a before/after pair. The result gives you one upload command per image: run it, and the screenshot appears in the session once the upload lands. No shell? Pass `imageBase64` instead.
- **Pages.** Root-cause write-ups, timelines and anything easier to read as a page go out with `publish_artifact` (one self-contained HTML file). Pass the `artifactId` from the earlier result to publish a new version of the same page.
- **Blocked means waiting on you.** `report_progress` with phase `blocked` shows the session as waiting on your operator in Gleap, with your message as the question. It does not expire while it waits, and your next report (`investigating`, `fixing` and so on) picks the session back up.
- **Stopped in Gleap.** When a Gleap result says the session was stopped, stop working: make no further changes, wrap up, and tell your operator.
- **Wrap up every turn.** Whenever you hand back to your operator, at the end of every turn and not only the last one, call `wrap_up`: the `recap` first (two or three sentences: what is now true, then what is not done or not verified), then at most one `ask`, only when the next move is theirs, with one or two `actions`, the recommended one first. Every action names its `action`: `open_pr`, `review_changes` or `merge_pr` once your PR is registered, `open_preview` while a preview is running, `send_customer_update` with your customer-facing draft as `message` (Gleap puts it in the composer; it never sends it on its own). Anything else your operator answers in this chat.

## 4. Fix

- `update_ticket` → status `"INPROGRESS"` (skip if the board has no such status).
- Find the root cause. Keep the diff minimal and in the repo's style; add a regression test where it makes sense.
- Verify before opening a PR: run the relevant tests/build and confirm the behavior actually changes. For a change your operator can see, share the screenshots from step 3.
- Branch `gleap/<ticket-number>-<short-slug>` off the repository's default branch (unless your operator says otherwise). PR title: `<concise summary> (Gleap #<ticket-number>)`. Link the ticket in the PR description.
- When the PR is up: `report_progress` with phase `pr_opened`, the `prUrl`, and the customer messages from step 5 (`customerUpdateMessage` and `customerShipMessage`). Registering the PR hands the rest of the lifecycle to Gleap: it sends the update message right away, sends the live message once the fix is live, and closes the ticket. You don't close it unless your operator tells you to.
- The merge signal comes from the repository's Gleap connection — if this repository is not connected to Gleap, tell your operator the merge won't be detected automatically.

## 5. Customer messages

- First call `get_ticket_messages` once more and honor any new internal notes addressed to you. Your operator's team may have steered the task while you worked.
- Opened a PR? Write two short messages in the customer's language (match the conversation): plain text, no internal details, file paths, or code. Pass them on your `pr_opened` `report_progress` call. Every `report_progress` result (already the first one) gives you this project's rules for them (whether the update message is sent, when the live message goes out, and whether to say "next release") and your team's instructions for customer messages. Follow both, including when the rules say to skip a message. If you leave a message out, Gleap drafts it from the conversation, so write them yourself: you know the fix best.
  - `customerUpdateMessage`: sent to the customer right away. Say the fix is done and is waiting to go live (review and deployment), and that we'll let them know once it's live.
  - `customerShipMessage`: sent when the fix is live, following the project's settings (a set delay after the production merge, or when a teammate confirms it is live). Include any step they must take, like refreshing or updating. For an SDK or app repository the fix ships in the next release: say so, and that they need to update.
- There is no approval step for either message: Gleap sends them in the name of the teammate who opened this session. The `report_progress` result has one line per message (sent, scheduled, skipped, or not used by this project); relay it to your operator in one line. Never send your own "it's fixed" or "it's live" message with `send_message`, not even after the merge.
- Your operator tells you to answer, tell, reply to, or update the customer? That instruction is the approval: write the message, send it with `send_message` (`isNote: false`), and tell your operator in one line what you sent. Only when they ask for a draft or want to review it first, stage it with `draft_reply_to_composer` instead: the reply appears in the ticket's composer, where your operator's team can edit and send it (the draft clears automatically when it is sent or dismissed). Only if `draft_reply_to_composer` is unavailable, post the draft as an internal note prefixed `Suggested reply:` instead.
- No PR (nothing to change in code, or the fix lives somewhere else)? Put what you found in `report_progress` and tell your operator what the customer should hear. Do not message the customer on your own; answer when your operator tells you to.
- Close, archive, or snooze the ticket only when your operator explicitly tells you to. Otherwise that is Gleap's job.

These messages are the only things you write to the ticket thread. Progress, blocked reasons, root cause, and the PR link all live in `report_progress` (the sidebar); do not repeat them as internal notes.

## Done when

The PR is open and registered via `report_progress` (phase `pr_opened`) with the customer messages the project's rules call for (normally `customerUpdateMessage` and `customerShipMessage`), and every message your operator asked for is sent (or staged, when they asked for a draft). Finish with `report_progress` phase `done` and a one-line root-cause summary in its message, then end the turn with `wrap_up` and stop. Leave the ticket open unless your operator tells you to close it.

## Hard rules

- Close, archive, or snooze the ticket, or change the assignee, only when your operator explicitly tells you to. Otherwise closing is Gleap's job: once your registered PR is merged and the fix is live, Gleap sends your live message and closes the ticket itself. "The work is finished" is never a reason to close it on your own.
- An instruction from your operator to answer or update the customer is the approval: send it, do not ask again. Draft only when they ask for a draft or a review. Never message the customer on your own beyond the two messages on `pr_opened`, and never send a second "it's fixed" or "it's live" message yourself: that is what `customerShipMessage` is for.
- Do not post internal notes for status or findings; that is what `report_progress` is for. `send_message` is only for customer messages your operator asked for.
- Never commit `.gleap/`, and never print or paste the token in `.gleap/session.json`.
- Gleap replies are plain text; do not use markdown in them.
