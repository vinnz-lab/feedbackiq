# Decision log and historical requirements

## Decisions and their evolution
- **21–22 July 2026:** Original FeedbackIQ PRD: internal-first and SaaS-ready; ingestion-led workflow, traceable evidence, human review and roadmap. It contains many aspirations and prototype requirements that differ from present code.
- **27 July:** Build a real application with provider integrations; the agent that built it is not the runtime AI embedded in the app.
- **31 October:** User specified that platform ownership must not grant automatic access to tester workspaces; theme names are user-editable, summaries remain AI-owned.
- **1 November:** Invite-only access; Jira permissions later expanded beyond the originally owner-only plan. Role labels and exact capabilities must be taken from current code, not older requirements.
- **25 October:** Trend badge changed from a static stored value to calculated week-over-week behaviour; no recent activity hides it.
- **8–11 November:** CI/Playwright trial work and PR #22; local browser tests passed, then Windows browser-launch problems were reported. Local webhook test’s address rotation is a safety concern.
- **11 November:** User preferred concise summary-result messages while keeping the cooldown. Change was committed to `main`; user reported deployment completed.
- **17 November:** Owner chose handover documentation in the same repository, preview first, without overwriting existing resources or committing before approval.

## Original requirements versus reality
The PRD envisaged direct audio/video upload, email forwarding, vector-based semantic deduplication, editable per-evidence controls, and richer workflows. These cannot be assumed to exist today. Direct audio/video upload is currently hidden in the inspected UI; some server support remains. Original numeric quality, performance and cost targets are aspirations, not verified results. Read the historical PRD for full requirements and use the code/status matrix to identify gaps.
