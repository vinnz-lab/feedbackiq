# Product, users and capabilities

## Product
Insight Hub helps teams consolidate customer feedback from multiple sources, group related requests and problems, inspect evidence and support roadmap decisions. The owner’s stated intent is an invite-only showcase, with internal-first origins and possible future SaaS. ‘AI suggests; people decide’ is a product principle, not a guarantee that every historical record was manually reviewed.

## Main journeys and status
| Area | Current implementation / caveat |
|---|---|
| Ingest | Paste and file uploads, source parsing and a per-workspace inbound webhook. The UI currently parks direct audio/video upload; do not present older PRD support as shipped. |
| Register | All items, Needs review and Sources. Review cards expose Correct, Approve and Discard for authorized users. Theme detail evidence shows approved items, but has no per-item reassign/remove control. |
| Themes | Evidence, summaries, naming, consolidation and real recent-period trend badges. Original feedback date is used where present; otherwise creation date. No activity in either of the rolling seven-day windows hides the badge. |
| Roadmap | Promote a theme to an enhancement and prioritize; Jira Cloud integration supports sending and refreshing with explicit actions. |
| Sharing | Owner-managed read-only digest and roadmap share links; digest links can reveal names and quotes to anyone holding the link. |
| Reports | Dashboard, trends, digest, audio briefings, search and guide; check each workflow and environment before demoing. |
| Integrations | Inbound webhook, Jira Cloud, outgoing Slack/Teams digest posting and workspace AI credentials. Automated Slack collection and email forwarding were discussed as coming soon, not confirmed shipped. |

## Roles and privacy
`src/lib/permissions.ts` defines current capability enforcement: Owner has edit/Jira/admin; Contributor, Executive and Engineer have edit/Jira; Viewer is read-only. Product history distinguishes personas, but the current capability matrix—not the original PRD—is authoritative. Workspace membership gates access; the platform owner does not automatically gain visibility into tester workspaces. Verify all server-side routes/actions independently of UI controls.

## Goals and non-goals
Reduce manual consolidation; preserve traceability; make roadmap decisions evidence-backed; provide an executive digest; maintain workspace privacy. Not a helpdesk or Jira replacement. Public voting, customer portal, feedback-to-prototype and advanced automated connectors were discussed as future ideas; do not claim they are implemented.

Sources: original July 2026 PRD (historical) in `docs/sources-and-archive.md`; code paths `src/app/(app)/`, `src/lib/permissions.ts`; product history in the source inventory.
