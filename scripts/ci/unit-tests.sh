#!/usr/bin/env bash
# Runs every code-level test on a fresh test database each time.
# Skips the two that need real Google/transcription keys.
set -u
cd "$(dirname "$0")/../.."
export AI_KEYS_SECRET="ci-only-secret-0123456789-abcdefghijklmnop"
fail=0; pass=0; failed=()
for f in scripts/*-test.ts; do
  case "$f" in *gemini-test*|*transcribe-test*) continue;; esac
  rm -rf ./.pglite-ci
  PGLITE_DIR=./.pglite-ci npx tsx scripts/db-setup.ts >/dev/null 2>&1
  case "$f" in
    *search-test*|*sample-data-test*|*briefings-test*) PGLITE_DIR=./.pglite-ci npx tsx scripts/seed-second-workspace.ts >/dev/null 2>&1;;
  esac
  if PGLITE_DIR=./.pglite-ci timeout 300 npx tsx "$f" > "/tmp/ci-$(basename "$f").log" 2>&1; then
    pass=$((pass+1)); echo "ok   $f"
  else
    fail=$((fail+1)); failed+=("$f"); echo "FAIL $f (see log)"; tail -15 "/tmp/ci-$(basename "$f").log"
  fi
done
echo "unit tests: $pass passed, $fail failed"
[ "$fail" -eq 0 ]
