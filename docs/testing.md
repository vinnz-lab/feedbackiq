# Testing: scenario matrix and limitations

## Snapshot
The last user-reported local result on 8 November was **17 passing Playwright tests**, using one worker, against their local sample environment. On 11 November local browser tests failed to launch Chromium with `spawn UNKNOWN`; two request-only tests passed. The cause was not established. A screenshot later showed the PR #22 Actions run green, but current check results could not be read through the integration. These are observations at the time, not a guarantee of today's status.

At the inspected commits, `main` had no `.github/workflows/`; `ci-tests` had `tests.yml`, config, smoke specs and a CI unit runner. PR #22 was open and unmerged at inspection. Verify before claiming current status.

| Scenario | Implementation / execution |
|---|---|
| Home, login screen, privacy, reset form/back link, unknown-page 404 | `e2e-smoke/home.spec.ts`, `login.spec.ts`, `public-pages.spec.ts`; CI branch |
| Signed-out `/dashboard` redirects to login | `locked-pages.spec.ts`; CI branch |
| Malformed webhook token rejected; GET returns help/405 | `webhook.spec.ts`; CI branch; malformed token does not prove rejection of a well-formed unknown token |
| Dev-profile sign-in, sign-out, signed-in pages | `profile-login.spec.ts`, `signed-in-pages.spec.ts`; skipped if picker absent |
| Paste and save; correct and approve | `ingest-paste.spec.ts`, `approve-item.spec.ts`; data-writing, skipped if picker absent |
| Viewer review-page controls | `viewer-permissions.spec.ts`; UI-only check; does not prove server-side authorization |
| Valid webhook into review | `webhook-feedback.spec.ts`; data-writing and may replace existing webhook; isolated test workspace only |
| Real password sign-in, independent authorization, real-provider AI/Jira/Slack, share link, reset-link expiry | Coverage not established by this smoke suite; plan isolated fixtures/services before asserting coverage |

A green CI job does not mean skipped tests ran. Some existing `scripts/*-test.ts` tests use fakes or structural checks. The CI runner skips two tests described as requiring keys although their inspected source indicates stubs; review that mismatch. It suppresses setup output and does not stop immediately on failed database setup. The original PRD’s coverage targets are not evidence of current coverage.

Use `npx playwright test e2e-smoke/home.spec.ts --headed` for a single non-mutating local diagnostic once the app is safely running. Never run the full suite against a live base URL or live database.
