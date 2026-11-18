# Architecture and data flow

## Verified stack at snapshot
Next.js 16 App Router and React 19, TypeScript, Drizzle ORM; UI/server actions/API routes under `src/app`, shared components under `src/components`, data schema in `src/db/schema.ts`, provider and business logic under `src/lib`. Supabase Auth and Postgres are used when configured; without `DATABASE_URL`, `src/db/index.ts` uses persistent local PGlite. Vercel configuration is in `vercel.json`; actual deployed environment and region require checking.

## Flow
1. A user uploads or pastes at `/ingest`, or a sender posts to a workspace webhook. Parsers normalize sources, dedupe where applicable and persist feedback with source information.
2. Register shows items and review state. AI classification and extraction suggest type, sentiment, severity, confidence and theme; long inputs may be split into separate items.
3. Approved feedback powers theme evidence and downstream views. Authorized reviewers correct/approve or discard review items. Check code paths for exceptions before claiming every approved item was human-reviewed.
4. Themes can be summarized, promoted into roadmap items, linked to Jira, and used by digests and audio briefings.
5. Share links provide read-only bearer access to selected outputs. Owners control link creation and revocation.

## Data and identity boundaries
Workspace membership is resolved server-side, including verification of the selected workspace cookie. A platform administrator is not automatically a workspace member. Server actions and route handlers are independently addressable; each must enforce authorization and workspace scoping, not rely solely on the app layout. Inspect `src/lib/workspace.ts`, `src/lib/auth.ts`, `src/lib/permissions.ts`, `src/lib/guard.ts`.

## Reality check
The original PRD envisioned a separate job queue, vector search and storage; these are historical design intentions, not a description of the inspected stack. Review current code and migrations instead.
