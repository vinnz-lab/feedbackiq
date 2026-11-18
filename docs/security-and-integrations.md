# Security, integrations and sensitive operations

## Data protection
- Preserve workspace separation: membership, workspace-scoped queries and server-side capability checks. Database RLS/grants in the live Supabase environment are **not independently verified**; inspect them before claiming complete database-level isolation.
- Real auth is Supabase-backed; dev profile selection requires `ALLOW_DEV_LOGIN=true` and must not be exposed on a public deployment. The code fails closed when auth is unconfigured and dev login is off.
- `AI_KEYS_SECRET` protects stored integration credentials and some share-token material. Changing or losing it can make encrypted values unreadable. Record where it is managed, never the value.
- Share and webhook addresses are bearer credentials. Never paste full links into documentation or screenshots. Digest shares may contain quotes and customer names; roadmap shares have a narrower disclosure surface. Revocation/regeneration invalidates the previous link.

## Integrations
- Incoming webhook: secret address or bearer token; workspace-scoped, limited request size/rate; feedback is queued for review. Replacing an address breaks senders using the old one.
- Jira Cloud: explicit send/refresh; name handling can be configured. Real Jira verification was historically outstanding.
- Slack/Teams: outgoing digest posting; third-party destinations and write actions need explicit authorization.
- AI keys: workspace-specific provider credentials or a platform key; don't copy secrets into chat, logs or Git.

## Operations that require explicit approval
`bootstrap.sql` drops tables; `scripts/db-setup.ts` removes its PGlite directory; seed and clear/delete flows can cascade; the webhook-feedback test can rotate a working webhook and add data. The cron keepalive route also performs audio retention cleanup, and its auth depends on `CRON_SECRET` configuration; live configuration is unknown. Audit these before any operational run.
