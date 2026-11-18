# Development and deployment runbook

## Before beginning
Confirm branch, environment, current commits, PRs and the intended database. Never assume the sample database is disposable merely because it is local. Keep existing files and data; take an appropriate backup before destructive work.

## Local development — overview
Requirements are Node.js and npm; CI branch uses Node 24. On a fresh local checkout, `npm ci` installs locked dependencies and `npm run dev` starts the app. Local PGlite is selected when `DATABASE_URL` is unset; its directory defaults to `./.pglite` or uses `PGLITE_DIR`.

**Destructive setup:** `scripts/db-setup.ts` recursively deletes that target directory before migrations and sample seeding. Only use it after verifying the exact path and confirming nothing needs retaining. Do not run `bootstrap.sql` or `clean-setup.sql` against an existing production database; deployment setup SQL has different assumptions and requires review.

For local passwordless sample profiles, `ALLOW_DEV_LOGIN=true` is an explicit opt-in only when Supabase authentication is not configured. Do not apply this to an internet-accessible environment. Keep the dev server running in one terminal and tests in another. On Windows PowerShell, `npx.cmd` avoids a blocked `npx.ps1` execution policy without changing security settings.

## Production
Historical deployment uses Vercel and Supabase; `NEW-DEPLOYMENT.md`, `vercel.json` and `drizzle/` are starting points, not evidence of the current live configuration. Confirm real database/project, secret names, backups, migration history and region before changes. `clean-setup.sql` is intended for an empty project—not a general migration/reset tool.

A push to `main` may deploy depending on Vercel configuration. Check the exact deployment and build logs after release; a GitHub commit is not proof of production success. The 11 November summary-message commit was reported deployed; recheck current state.
