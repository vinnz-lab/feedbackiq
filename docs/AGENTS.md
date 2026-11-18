# Working on Insight Hub

Read `docs/README.md` first; then product, architecture, AI/review, security and testing. Inspect the current repo and deployment state rather than assuming a historical note remains current. Separate verified implementation, user-reported behaviour and proposed features in every update.

## Safety rules
- Do not run reset, seed, migration, webhook-rotation, deletion, deployment or data-writing actions against any environment without confirming the exact target and impact. Never point tests at a live workspace by default.
- `scripts/db-setup.ts` deletes its selected PGlite directory before seeding. `bootstrap.sql` drops tables. The webhook feedback smoke test may replace a real webhook address. Inspect `DATABASE_URL`, `PGLITE_DIR`, `BASE_URL` and test code first; never print their secret values.
- Do not enable `ALLOW_DEV_LOGIN` on an internet-accessible deployment. Dev profiles bypass password sign-in.
- Never commit credentials, encryption keys, service-role keys, bearer share/webhook links, real customer data or unredacted logs. Ask the owner to configure secrets through the appropriate secret manager.
- Keep workspace isolation and server-side authorization as invariants. Do not infer RLS is correct without inspecting live policies and grants.
- When changing functionality, update relevant docs and tests. Do not alter unrelated resources or merge/deploy without explicit authorization.
- Cite relevant code paths and dated source history; preserve uncertainty and record decisions that supersede earlier ones.
