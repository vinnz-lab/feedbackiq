# AI, confidence and review

## Classification and theme grouping
`src/lib/ai/classify.ts` supplies the model with a feedback quote, existing theme titles and product-area context. It requests a JSON classification: type, sentiment, severity, confidence and theme. It instructs the model to strongly prefer existing themes and match by meaning rather than wording; only propose a new name for genuinely different feedback. This is an instruction, not proof of reliable semantic clustering.

Confidence is a **model-selected High/Medium/Low label**, not a calibrated percentage or a guarantee of correctness. Invalid enumerated outputs are given defaults by code; the exact downstream consequences should be checked before making trust claims. Low confidence can be labelled for review; unattended arrivals also need review, and AI-classified review items remain reviewable. See `src/app/(app)/register/ai-actions.ts` and `src/components/review-card.tsx`.

## Review and approval
The review queue provides Approve, Correct and Discard when authorized. Ordinary approval requires classification prerequisites; Correct and approve is a separate manual path. Theme detail lists approved evidence; it does not provide per-item editing. Do not tell a user that an already-approved item can be corrected using Needs review unless it is actually placed there by a supported flow.

## Summaries and digests
Theme summary prompts in `src/lib/ai/summarize.ts` ask for short text grounded only in provided quotes, with no invented facts. This reduces risk but does not ensure factual accuracy. Digests use approved workspace feedback; **review required:** the inspected digest code labels the report as a recent period but its feedback query is not date-filtered. Verify and fix before promising a strictly weekly analysis.

## Providers and limits
The implementation supports a platform Gemini key and workspace-configured Gemini, OpenAI or Anthropic keys. A paid account does not eliminate provider limits or costs. `src/lib/guard.ts` enforces a 15-second cooldown per workspace/action, plus caps per action (platform shared 25 and own-key workspace 200 in a rolling 24 hours). Its check-and-log sequence is not an atomic distributed lock. Provider pacing in `src/lib/ai/client.ts` is process-local.

A main-branch change on 11 November made regeneration messages distinguish success, no updates and errors; cooldown remains. Re-check deployed status and latest implementation.
