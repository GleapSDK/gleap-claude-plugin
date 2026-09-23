# Gleap for Claude

Work your [Gleap](https://www.gleap.ai) support queue from Claude Code and Cowork: triage tickets, look up customers, draft replies grounded in your help center, manage CRM pipelines, and pull support analytics.

## Install

```
/plugin install gleap
```

On first use Claude connects to the Gleap MCP server and opens an OAuth prompt. Sign in, pick the project you want Claude to access, and you're done. No API key or client ID setup.

## What's included

**Connector** — the hosted Gleap MCP server at `https://mcp.gleap.io/mcp`, exposing 71 tools across tickets, contacts, companies, CRM pipelines, help center, surveys, feature requests and analytics. Read tools are annotated read-only and run without a confirmation prompt; anything that creates, updates or deletes always asks first.

**Skills**

| Skill | What it does |
|---|---|
| `/triage-inbox` | Ranks the open queue by what costs most if it waits, clusters tickets sharing a root cause, and proposes owners and priorities. |
| `/draft-support-reply` | Reads the full thread and the customer's history, grounds the answer in your help center, and drafts a reply in the customer's language. |

## Requirements

A Gleap account with at least one project. Any paid or trial plan works.

## Examples

- "Triage the Gleap inbox and tell me what needs attention today."
- "Find the contact for sarah@acme.com and summarize her recent tickets."
- "Draft a reply to ticket 143790."
- "What was our average first response time last month compared to the month before?"
- "Create a help center article explaining how to reset a password, in English and German."

## Privacy Policy

Gleap's privacy policy is at **https://www.gleap.ai/legal/privacy-policy**.

**What is collected.** The connector transmits only the arguments of the tool calls Claude makes (search terms, ticket and contact identifiers, and any content you ask it to write) to the Gleap API, plus the OAuth token identifying your workspace. It does not read your conversation history, Claude's memory, or local files.

**How it is used and stored.** Requests are served by the Gleap API against your own workspace data and are subject to the same retention as the rest of your Gleap account. The MCP server does not keep a separate copy of request content.

**Third-party sharing.** None beyond the subprocessors already listed in Gleap's privacy policy and Data Processing Agreement.

**Retention.** Workspace data follows your Gleap account's retention settings. OAuth tokens persist until you revoke them, from Gleap → Settings, or by disconnecting the connector.

**Contact.** support@gleap.io

## Support

- Setup guide: https://help.gleap.io/en/articles/191-connecting-to-the-gleap-mcp-server
- Gleap MCP overview: https://www.gleap.ai/mcp
- Email: support@gleap.io

## License

MIT
