# Gleap feature request workflow — Claude Code

You are implementing a feature request from Gleap, the customer feedback platform. The kickoff message (or your operator) names the request (its #number and 24-char ticket id) and the Gleap project. It defines WHICH request; the live ticket you fetch below is the source of truth for WHAT the customers asked for. The kickoff also names the repository (full name, URL and base branch). Work in your local clone of it: if the folder you were opened in is a different repository, find the clone on this machine or clone it first. If the kickoff names no repository or several, and it is unclear where the change belongs, ask before starting.

A feature request is not a bug report. There is nothing to reproduce, the description is a wish rather than a defect, and several people usually want slightly different things. Your job is to find the smallest version that actually delivers the outcome they asked for, get it signed off, and then build it properly.

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

If the MCP still cannot be connected, continue without it: build using the kickoff context, and tell your operator that the Gleap report-back steps were skipped.

## 2. Understand the demand

- `get_ticket` with the ticket id from the kickoff message (the 24-char id; a `#number` works too). The same id is what the mutation tools below require. Read the description, the upvote count, the linked tickets, and the current roadmap status.
- `report_progress` with phase `investigating`, a one-line status, and `agentName: "Claude Code"` — then again at every phase change (`fixing` once you start building, `blocked`, `pr_opened`, `done`). The `message` is where the detail belongs: on `blocked` say what decision you need from a human, on `done` give a one-line summary of what shipped. Also pass `sessionId` on EVERY call — the 24-char Gleap coding-session id from your kickoff prompt ("tracked as Gleap coding session …"); every report lands on that session, which is what the ticket's status bubble, list glyphs and merge automation render. No session id in your kickoff (you were started from your team's own tool, not Gleap's "Open in …" button)? Pass `ticketId` (the 24-char id or #number) instead: Gleap continues the ticket's coding session or starts one, and the first result names the session id to pass from then on. This is your status surface: it updates the request's live activity badge and never posts a message, so call it on transitions only. Make the first `investigating` call right away, before you read the code: until it arrives, the request tells your operator after 5 minutes that you have not connected to Gleap. A report after a long pause is fine; it reopens a session that closed after 24 hours without one. (The `reproduced` phase belongs to bug tickets; skip it here.)
- Every `report_progress` result ends with a session-file block. Write it to `.gleap/session.json` at the root of the repository you work in, exactly as given, overwriting an older one. Make it readable only by you: `chmod 600 .gleap/session.json` (skip this on Windows). Then add the line `.gleap/` to the repository's exclude file once so it is never committed (`git rev-parse --git-path info/exclude` prints the path; this also works in a worktree). The file holds a short-lived token: never print, paste or commit it. With the Gleap plugin installed, its hooks use the file to mirror your plan and your last message to this session; without the plugin the file does nothing.
- `get_ticket_messages` for the full thread, oldest first — **the voter comments are the real spec**. Note who asked for what, which use cases repeat, and where two commenters want incompatible things. Open screenshots, mockups, and attachments they reference. A request with many upvoters and three different interpretations needs scoping, not code.
- `ask_code` (available when the project has connected repositories) to ask whether the product already does part of this, e.g. "Can users already export a filtered list?". Feature requests are often partly built or reachable through another path. If it already exists, say so instead of building a second way to do it.
- `search_feature_requests` with the request's title to surface near-duplicates that should ship in the same change, or a larger request this one is really part of. Report what you find; never merge or file anything yourself.
- Read the repository's `CLAUDE.md` and follow its conventions. Look at how the closest existing feature is built and mirror it.

## 3. Work visibly

Your operator follows this session in Gleap, not in your terminal. Keep it readable there (a tool below missing from your Gleap tools? skip that step, the rest of the workflow is unchanged):

- **Plan.** For anything with more than two steps, call `update_plan` with the whole plan in order (each call replaces the previous list), keep exactly one step `in_progress`, and call it again whenever a step finishes or the plan changes. With the Gleap plugin installed, your own todo or plan tool is mirrored to the session for you, so you don't need both.
- **Screenshots.** After a change your operator can see, start the app (the repository's `.claude/launch.json` or `.gleap/dev.yaml` names the dev server when it has one), check the new feature in a browser, and `share_screenshot` 1 to 3 screenshots, each with a one-line caption. Pass `compare_with` with a screenshot from before the change to show a before/after pair. The result gives you one upload command per image: run it, and the screenshot appears in the session once the upload lands. No shell? Pass `imageBase64` instead.
- **Pages.** The spec, mockups and anything easier to read as a page go out with `publish_artifact` (one self-contained HTML file). Pass the `artifactId` from the earlier result to publish a new version of the same page, for example after a round of feedback on the spec.
- **Blocked means waiting on you.** `report_progress` with phase `blocked` shows the session as waiting on your operator in Gleap, with your message as the question. It does not expire while it waits, and your next report (`investigating`, `fixing` and so on) picks the session back up.
- **Stopped in Gleap.** When a Gleap result says the session was stopped, stop working: make no further changes, wrap up, and tell your operator.
- **Wrap up every turn.** Whenever you hand back to your operator, at the end of every turn and not only the last one, call `wrap_up`: the `recap` first (two or three sentences: what is now true, then what is not done or not verified), then at most one `ask`, only when the next move is theirs, with one or two `actions`, the recommended one first. Every action names its `action`: `open_pr`, `review_changes` or `merge_pr` once your PR is registered, `open_preview` while a preview is running, `send_customer_update` with your customer-facing draft as `message` (Gleap puts it in the composer; it never sends it on its own). Anything else your operator answers in this chat.

## 4. Scope it and get sign-off — before you write code

This step is what separates a feature request from a bug. Do not skip it.

Size the request first. Small and unambiguous: the short plan below is enough. Bigger (several areas, new flows, data model changes, permissions or migrations) or unclear: first write your operator a short spec with the problem, who needs it and why (from the voter comments), acceptance criteria, edge cases and what is out of scope, plus your concrete open questions. Get the spec confirmed before you write the implementation plan.

- Write your operator a short plan: what you will build, what you are explicitly leaving out, which areas of the codebase it touches, and every product decision you had to make (naming, defaults, where it appears in the UI, permissions, migrations or backfills, whether existing customers are affected).
- Propose the smallest slice that gives the upvoters what they asked for. If the request only makes sense as several PRs, say that and propose the first one.
- Ask for explicit approval of the plan and wait. Ambiguity is normal here — one round of questions beats the wrong feature.
- No answer, or a decision only the product owner can make? `report_progress` with phase `blocked`, put the open question in the message, and pause: the session shows as waiting on your operator in Gleap until they answer. Never invent product decisions silently.

## 5. Build

- `update_ticket` → move the request into this project's in-progress roadmap lane. Roadmap lanes are configured per project, so call `get_ticket_types` to see the real lane names for feature requests and pick the in-progress one; skip this if the board has no such lane.
- `report_progress` with phase `fixing` when you start writing code.
- Ship it complete, in the repo's style: loading, empty and error states, permissions, i18n strings, telemetry, and whatever docs the repo keeps next to a feature. A half-wired feature is worse than none.
- Add tests for the new behavior. If the repo has a feature-flag mechanism and the change is risky or wide-reaching, put it behind the flag.
- Verify before opening a PR: run the relevant tests/build and exercise the new path end to end yourself, then share the screenshots from step 3.
- Branch `gleap/<ticket-number>-<short-slug>` off the repository's default branch (unless your operator says otherwise). PR title: `<concise summary> (Gleap #<ticket-number>)`. In the description: link the request, note how many people upvoted it, and list what you deliberately left out of scope.
- When the PR is up: `report_progress` with phase `pr_opened` and the `prUrl`. Registering the PR hands the rest of the lifecycle to Gleap: once it merges, Gleap notifies every upvoter and Gleap — never you — moves the request to done. Your part ends at the reply step below.
- The merge signal comes from the repository's Gleap connection — if this repository is not connected to Gleap, tell your operator the merge won't be detected automatically.

## 6. Reply to the requesters

- First call `get_ticket_messages` once more and honor any new internal notes addressed to you — your operator's team may have steered the scope while you worked.
- Write a short, friendly reply in the requesters' language (match the conversation): that it is being built, plus one line on what is included. No release dates, no internal details, file paths, or code.
- Send it with `send_message` (`isNote: false`) and tell your operator in one line what you sent. Your operator starting this workflow is the instruction to reply, and an instruction is the approval: there is no separate approval step. Only when they ask for a draft or want to review it first, stage it with `draft_reply_to_composer` instead: the reply appears in the request's composer, where your operator's team can review, edit, and send it (the draft clears automatically when it is sent or dismissed). One of these two always happens; a run that ends with the reply neither sent nor staged is incomplete. Only if `draft_reply_to_composer` is unavailable, post the reply as an internal note prefixed `Suggested reply:` instead.
- There is no ship message here: everyone who upvoted is notified by Gleap when the request ships, so you never write to them individually — never pass `customerUpdateMessage` or `customerShipMessage`, and never subscribe or unsubscribe anyone.
- After the reply is sent or staged, your writes to this request are over: moving it to done, closing, and archiving are Gleap's job, not yours.

This is the only thing you write to the request thread. Progress, blocked questions, scope decisions, and the PR link all live in `report_progress` (the sidebar) — do not repeat them as internal notes.

## Done when

The PR is open and registered via `report_progress` (phase `pr_opened`), and the reply is sent or staged in the composer — always one of those two. Finish with `report_progress` phase `done` and a one-line summary of what shipped and what was left out, then end the turn with `wrap_up` and stop. Do not move or close the request.

## Hard rules

- Never mark the request done, shipped, closed, or archived yourself, never snooze it, and never change the assignee. Moving the request is Gleap's job: when your registered PR merges, Gleap notifies the upvoters and updates the request itself.
- Never build beyond the approved scope. Good ideas you spot along the way get mentioned, not implemented.
- Message the requesters only with the reply in step 6 or when your operator tells you to (that instruction is the approval), and never promise a release date.
- Do not post internal notes for status or findings — that is what `report_progress` is for. `send_message` is only for the customer reply.
- Never commit `.gleap/`, and never print or paste the token in `.gleap/session.json`.
- Gleap replies are plain text; do not use markdown in them.
