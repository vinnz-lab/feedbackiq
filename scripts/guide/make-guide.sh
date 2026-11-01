#!/usr/bin/env bash
# Rebuilds public/insight-hub-guide.pdf from a fresh demo workspace. Run from the repo root after `npm run build`.
set -e
p=$(ss -ltnp 2>/dev/null | grep ":4000" | grep -o 'pid=[0-9]*' | cut -d= -f2 | sort -u); [ -n "$p" ] && kill $p; sleep 1
rm -rf .pglite-guide
PGLITE_DIR=./.pglite-guide npx tsx scripts/db-setup.ts >/dev/null 2>&1
PGLITE_DIR=./.pglite-guide npx tsx scripts/guide/seed-guide.ts
(PGLITE_DIR=./.pglite-guide ALLOW_DEV_LOGIN=true AI_KEYS_SECRET=guide-only-secret-0123456789-abcdefghij INSIGHT_HUB_FEEDBACK_WEBHOOK=https://example.invalid/api/hooks/feedback/fiqwh_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA nohup npx next start -p 4000 >/tmp/guide-server.log 2>&1 &)
for i in $(seq 1 30); do curl -s -o /dev/null http://localhost:4000/login && break; sleep 2; done
rm -rf /tmp/guide-shots
node scripts/guide/shots.mjs
node scripts/guide/build-guide.mjs
p=$(ss -ltnp 2>/dev/null | grep ":4000" | grep -o 'pid=[0-9]*' | cut -d= -f2 | sort -u); [ -n "$p" ] && kill $p
