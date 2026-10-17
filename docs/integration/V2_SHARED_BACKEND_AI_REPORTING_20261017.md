# AI reporting inventory and owner gate — 2026-10-17

Inventory disposition: AI_REPORTING_EXISTING_CAPABILITY=NOT_FOUND; AI_REPORTING_GAP_CONFIRMED=YES.
Priority: P2. Classification: CONFIRMED_DEFECT (consumer reporting gap), implementation BLOCKED_TEST/owner decision.

## Complete shared-surface trace

| Surface | Presentation/source | Generation and current controls | Reporting disposition |
|---|---|---|---|
| Talk It Out (AI tab, modal, onboarding) | src/features/talk-it-out/TalkItOutView.tsx, TalkItOutEntry.tsx; app/(app)/ai.tsx, app/talk-it-out.tsx, app/onboarding/talk-it-out.tsx | src/store/TalkItOutContext.tsx → src/platform/herKeysAiClient.ts → herkeys-ai; conversational Gemini text and structured chips; local degraded engine; restart/retry controls | No response report/flag/dislike/unsafe submission or associated backend |
| Smart Inbox | src/features/talk-it-out/capture/CaptureCards.tsx, capture/LifeInboxView.tsx; src/features/smart-inbox/ | smart-inbox-extract, proposal review and explicit save/correct/reject controls | Correction/rejection changes a proposal; it is not a safety report or reviewer notification |
| Daily Load Autopilot | src/features/daily-load/premium/ | Deterministic local recommendation/review, permission-gated by server | Approve/reject/undo receipts are action governance; no safety reporting |
| Momentum / weekly reviews | src/features/momentum/premium/PremiumMomentumSection.tsx, momentumFlow.ts | Deterministic evidence-based counts/patterns, saved review/next-step controls | Domain report means a weekly review, not a consumer safety submission |
| Premium Home | src/features/premium/PremiumHome.tsx | Capability/availability and subscription states; no independent generated conversation | No reporting route |
| Account, settings/navigation and support | app routes; src/features/account/; source-wide report/flag/feedback/unsafe/mailto/support inventory | paywallFeedback.ts and inline notices describe action outcomes; DeletionGate says contact support but supplies no AI reporting flow | No compatible consumer submission path or operational review destination found |
| Backend | supabase/functions and both public/private live catalogs | Premium decisions/metrics and consent receipts have other contracts | No report/flag table, authenticated report submission, reviewer queue, retention/disposition policy or monitored destination found |

All platform entry routes converge on the same shared presentation. No separate native implementation is needed.
The inventory covers source-wide semantic search and traced UI handlers/backend contracts, not just the absence of a particular label.

## Applicable policy review

Reviewed 2026-10-17:
- [Google Play AI-generated content policy](https://support.google.com/googleplay/android-developer/answer/13985936?hl=en): in-app flagging/reporting to developers for covered generated content.
- [Google's scope guidance](https://support.google.com/googleplay/android-developer/answer/14094294?hl=en): central conversational chat is covered; limited productivity enhancement and summarization-only apps have exceptions. Talk It Out is conversational generation. Smart Inbox extraction is a productivity enhancement, so an identical independent mandate is not assumed. A common reporting control can still cover its generated suggestions.
- [Apple App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/): review 1.2 in the context of UGC/social interaction, and 5.1 privacy/third-party AI consent. These private household features are not assumed to be public UGC. No blanket claim that every deterministic suggestion requires identical moderation is made.

Technical inventory/policy comparison completed. Final product/privacy/store-policy disposition remains PENDING.

## Concrete proposed shared contract (NOT implemented or deployed)

One themed, screen-reader-labelled report action at a generated-response/proposal context. Reasons: harmful/unsafe; offensive/discriminatory; inaccurate/misleading; privacy concern; other. Start with metadata only: authenticated account (server-derived), surface, request identifier when available, reason, idempotency key. Never attach conversation history, provider credentials or prompts. Optional response text requires a separate explicit action and approved bounded/redacted attachment policy.

Server validates allowlisted fields/lengths, authenticates, rate-limits by account, deduplicates durably, and returns a receipt only after persistence. Consumer confirms only accepted receipts, retains retry state after failure, disables double submit while pending, and performs no household mutation. RLS denies cross-account report access and all consumer reviewer access. Reviewers need an authenticated queue, least privilege, disposition audit, assigned operating owner and retention enforcement.

Before implementation the owner must select the actual monitored reviewer destination, retention/deletion periods and permitted attachment content. The assignment explicitly stops new sensitive AI collection/retention for owner approval. No retention period, new table or unmonitored endpoint has been invented. No inert button, mailto handoff, or false success toast was added.

Required implementation verification after that decision: UI availability on both platforms, themes/accessibility, accepted/invalid/duplicate/rate-limited reports, cross-account denial, thrown/HTTP failure/retry, attachment minimization, reviewer access and actual review/disposition rehearsal.

AI_REPORTING_SHARED_UI=FAIL
AI_REPORTING_BACKEND=FAIL
AI_REPORTING_POLICY_REVIEW=PENDING

