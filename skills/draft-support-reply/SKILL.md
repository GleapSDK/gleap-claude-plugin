---
name: draft-support-reply
description: Draft a reply to a Gleap support ticket, grounded in the help center and the customer's history. Use when asked to answer, reply to, or respond to a ticket, or to write a customer response.
---

# Draft a support reply

A good reply answers the question that was actually asked, in the language it was asked in, and cites something real.

## Read first

`get_ticket` for the ticket, then `get_ticket_messages` for the full conversation. Read the whole thread — the question in the last message is often not the question the customer opened with.

`get_contact` tells you who you are writing to: their plan, their company, and whether they are technical. `get_contact_tickets` shows what they have asked before, which is how you avoid repeating an answer that already failed them.

## Ground the answer

Search the help center with `search_knowledgebase` before writing. If an article covers it, link the article rather than restating it at length.

`search_similar_tickets` finds how this was answered before. Reuse what worked.

If nothing grounds the answer, say so in your draft rather than inventing behavior. A reply that says "let me confirm this with the team" is better than a confident wrong one.

## Write

Match the customer's language. If they wrote in German, reply in German.

Lead with the answer, then the explanation. Support replies are scanned, not read.

Keep the register the customer set. Terse question, terse answer. Frustrated customer, acknowledge it once and then solve the problem — do not spend three sentences apologizing.

Be specific about next steps and who owns them. "We are looking into it" with no owner and no timeframe is what makes customers write again.

## Deliver

Show the draft in chat first. On approval, `send_message` sends it. `draft_reply_to_composer` stages it in the dashboard instead so a human can edit and send.

If the ticket needs engineering, `create_feature_request` files it on the roadmap — but call `search_feature_requests` first, since duplicates fragment the upvotes that decide what gets built.
