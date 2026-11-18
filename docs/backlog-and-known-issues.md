# Backlog, issues and decisions to verify

## High-priority review candidates — not yet authorized work
1. **CI / PR #22:** inspect current status, changed files and checks; preserve main’s later summary-message changes. Consider the safety of the local webhook test before merging or running it.
2. **Data safety:** make data-writing tests use isolated fixtures and never rotate an existing webhook; add explicit safeguards. Audit live RLS/grants and cron authentication.
3. **Digest accuracy:** investigate weekly label versus all-time approved-feedback query; specify intended period and add tests.
4. **Theme reuse:** compare exact-title and near-title matching paths; evaluate on a labelled fixture, including over-merging and under-merging.
5. **AI safeguards:** assess concurrency/races in cooldown/caps and process-local pacing; add tests for multiple simultaneous requests if needed.
6. **Windows test runtime:** investigate `browserType.launch: spawn UNKNOWN`; no root cause was verified. Do not disable security controls as a diagnostic shortcut.
7. **User experience:** add explicit close control to the digest share popup if requested. Existing Share button toggles it; turning off a link is a different action. Item-level reassign/removal on theme detail was discussed but not built at the snapshot.

## Product and operational decisions
- Validate real Jira and workspace OpenAI/Anthropic credentials in isolated test environments; historic use of stubs is not proof of real integration behaviour.
- Consider dedicated staging, real-login test accounts and safe secret injection for authenticated CI.
- Evaluate reset-password email delivery, audio storage, commercial hosting/database plans and support/privacy/compliance before customers; actual account plans/configuration were not checked.
- Decide whether Executive and Engineer should remain contributor-equivalent; improve role documentation if needed.
- Compare existing PRD aspirations with shipped capabilities, including forwarding, automated collection, per-item editing, citations and evaluation metrics.

These are research-based candidates, not promises or a confirmed priority order. Assign owners and acceptance criteria with the product owner.
