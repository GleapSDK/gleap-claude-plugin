---
name: triage-inbox
description: Triage the Gleap support inbox — find what needs attention now, group it by theme, and propose an assignment and priority for each ticket. Use when asked to triage, review the queue, check what's waiting, or find urgent or unassigned tickets.
---

# Triage the Gleap inbox

Turn an unsorted queue into a ranked, assignable list.

## Gather

Call `find_tickets` for open tickets. Prefer one broad call over several narrow ones, then filter in your head. Pull the fields that decide urgency: status, priority, assignee, tags, and creation date.

For anything that looks urgent or ambiguous, call `get_ticket` to read the full content before you judge it. Do not rank on titles alone — a calm title often hides a churn risk.

When the customer matters to the ranking, `get_contact` or `get_company` gives you their plan and value.

## Rank

Sort by what will cost the most if it waits, not by age:

1. **Blocked customers** — the product is unusable for them right now.
2. **Aging unassigned** — open, nobody owns it, and it has been sitting.
3. **High-value accounts** — weight by plan and company value when you have them.
4. **Quick wins** — answerable in one reply from an existing help center article.
5. **Everything else.**

## Report

Give a short ranked list. For each ticket: the number and title, one line on what it needs, and a suggested owner and priority. Group tickets that share a root cause and say so once rather than repeating yourself per ticket — a cluster of five reports about one bug is a single problem.

Close with the themes you noticed across the queue. That pattern read is usually worth more than the individual rankings.

## Acting on it

Propose before you change anything. Once the user picks, `assign_ticket`, `update_ticket` and `add_ticket_tags` apply the decisions. Never change status or assignee without being asked.
