# Her Keys V2 Codex continuation checkpoint

This is a continuation of the authorized engineering takeover, not a new audit or a completed integration certification. Owner instruction: secure PR #48, preserve all changes, report truthfully and hand off before another major workstream. No signed IPA/AAB, main merge, store submission or commercial activation.

## Source authority and PR state

- Repository: https://github.com/herkeys/her-keys
- Authorized convergence branch: integration/v2-autonomous-upgrade-20261112.
- Original Sonnet pin: `a8cbf21dd707dfc5a5f27abf8355fba6eb89c996`.
- Original release baseline: `c37fa45c09facb370f8b6a7bd476a067818aaf3a`.
- PRs #45, #46 and #47 merged with green CI. Verified PR #47 merge: `e0f46626a55d45c9bf2506673328adc4caca9a81`; merge-head CI 43438726622 PASS.
- PR #48 implementation commit: `489cafc84d603ffdcce1cab7f9fe85189ce38c42`, already pushed to codex/v2-engineering-20261113. Follow-up checkpoint documentation changes are on the same branch.
- [PR #48](https://github.com/herkeys/her-keys/pull/48) is the authoritative live handoff record for its final pushed SHA, merge SHA, final exact-head CI, totals and merged/draft state. At this document's preparation it is draft while full regression and CI run. Its body must be updated after verification; never infer a green merge from this document's existence.

Use `C:/Users/jsmit/Her-Keys-Codex-V2`. The original `C:/Users/jsmit/Her Keys` working directory has pre-existing unrelated edits on feature/welcome-tree-auth-frontend; preserve it. Confirm the current branch, remote head and worktree status before changing anything. Do not target older October branches.

## Owner decisions

Explicit uncertainty is approved and must not become a goal, strength, struggle, profile fact or recommendation. Meaningful guards remain. Withdrawing unfinished system-suggested extra work on overload is approved; stored tasks, explicit user commitments and completion history must remain. Only the specific Zod Production patch is accepted; do not infer blanket Production approval. Keep checkout, test-store checkout and test fixtures OFF in both environments. Preserve deletion disabled/dry-run safeguards.

## Repair and verification ledger

PR #48 adds mutually exclusive undecided onboarding choices, filters uncertainty from generated profile facts, handles server uncertainty after auth/consent/output validation, and carries cancellation from the capture coordinator through Premium's account lifetime to installed Supabase fetch. Late results and durable writes retain their existing owner/household fences. Cancellation is not a guaranteed refund for server work already accepted.

Consolidated focused tests: 214/214, zero failed/skipped; additional profile identity tests 7/7. TypeScript, release identity, Expo install compatibility, Expo Doctor 21/21, Meals boundary and diff whitespace checks pass. Full local runs before the final repair were 5,579/5,599 (20 failures) then 5,598/5,599 (one failure), both zero skipped. Failures were missing subscription forwarding in hostile test wrappers and an old all-options-must-name-a-struggle assumption. The real subscription is now forwarded; unknown must explicitly produce a neutral question and no facts, and every concrete choice still has specific reasoning. No assertions were removed or tests skipped. Final local run and exact-head CI results must be read from the updated PR #48 handoff.

Logs remain outside Git at `%TEMP%/herkeys-v2-pr48-focused-final.log`, `herkeys-v2-profile-identity-recheck.log`, `herkeys-v2-pr48-full-final.log`, `herkeys-v2-uncertainty-doctor.log` and `herkeys-v2-uncertainty-boundary.log`. Resource-aware full suite:

```powershell
node --import ./tests/support/register-ts.mjs --import ./tests/support/register-jsx.mjs --test --test-concurrency=1 --test-timeout=600000 'tests/**/*.test.mjs'
```

Use npm 10 for lockfile regeneration. Preserve SDK 57, React Native 0.86.3, Reanimated 4.5.1, Worklets 0.10.1, gesture-handler 3.3.0 and one expo-modules-core. Read exact SDK 57 docs before code. iOS com.herkeys.app and Android com.heykeys.app are intentionally different. Previous unsigned development Metro smoke passed both platforms; no native artifact was generated. Native Apple/Google sign-in and store purchases are NOT_RUN here.

## Actual backend and safety state

| Environment | herkeys-ai | Hash | Checkout/test checkout/fixtures |
| --- | --- | --- | --- |
| Staging fhhudicklmpofuzkxeqe | 22, uncertainty repair, ACTIVE, JWT required | 3d2181e4eb35810ad4c187a434f84671f0550ef173e609dd7f4aa71aa43ee3f0 | OFF/OFF/OFF |
| Production npykvnxnehlsdlbumzwk | 13, accepted Zod-only patch, ACTIVE, JWT required | 5f0c8dee30535c3f8221946e6140b5eb13a151eb658bbe8689406632a48821ea | OFF/OFF/OFF |

Staging and Production intentionally differ for uncertainty until a specifically authorized promotion after review. Both retain unconditional current affirmative AI consent. No migration, RLS, secret, app identity or subscription identity changed this checkpoint. Staging's historical fixture flag was closed, not activated. Both deletion controls enabled=false/dry_run=true; purge jobs remain inactive. Production monitoring/retention automation still requires lifecycle investigation. Do not enable destructive processing or replay historical deletion fixture transfers as customer events.

Live Staging synthetic probes: recovered SDK session for independent backend testing; session restoration and renewal PASS; grant/revoke via the shipping consent adapter PASS; AI denies 403 before grant and after revocation; normal synthetic provider result and uncertainty fallback pass the shipping schema. Test account's original revoked choice restored; no mandatory legal acceptance invented. Session explicitly signed out and probe process exited. No password changed, no secret persisted, no real household text sent.

Recovery delivery is not recovery certification. Staging sends the default link-only Supabase email, redirecting to localhost:3000, while the UI requests a six-digit code: confirmed FAIL. Production's pre-existing synthetic-account delivery probe receives the branded accounts@herkeys.app reset-code message, so do not extrapolate the Staging template failure to Production. Code verification/expiration/replay, password change and subsequent actual login remain NOT_RUN. Public Auth settings enable Apple, Google and email in both projects, disable anonymous users and require email confirmation; this does not prove provider login works.

See [deployment ledger](V2_CODEX_BACKEND_DEPLOYMENTS_20261113.md), [execution ledger](V2_CODEX_EXECUTION_20261113.md) and [RevenueCat report](V2_CODEX_REVENUECAT_20261113.md) for identities, evidence, limitations and rollback. The controlled runtime probe script is pinned to the known marked Staging synthetic account and accepts only a public key through non-echoing stdin. Never log tokens, codes, private keys or email bodies.

## Known remaining defects and gates

Working inventory, not a completed new audit: zero confirmed open P0; two P1 issues (Staging recovery template/redirect mismatch; published RevenueCat paywall's placeholder legal links and unsupported claims); one partially repaired P2 (V2UP-B-P2a transport cancellation is fixed, server accepted-work/quota lifecycle still to verify); two carried P3 (V2UP-C-P3a free-user Smart Inbox discoverability; V2UP-C-P3b durable evidence for Smart Inbox time-saved counts). These five entries are not a claim that other workflows have been exhaustively certified. Keep residual dependency advisories separately visible: six audit entries, zero critical, Router/query-string/decode-uri-component mitigation is not a dependency fix, fingerprint/minimatch tooling risk remains. No SDK 58 migration.

V2UP-D-G3 and V2UP-B-P2b have source repairs in PR #48, with B-P2b deployed only to Staging. V2UP-A-P3, E-P3a, E-P3b and E-P3c were repaired in merged PRs. Account-isolation assertions pass at source level; independent real multi-account/reset/offline challenges remain. No blanket authentication, activation or shared-system PASS is issued.

External blockers: reusable ASC key XTNYDBS8T8 private material is not at the documented local encrypted path; securely provide an authorized credential reference, never secrets in chat. RevenueCat Apple API credential missing; Apple subscription key valid; Play catalog/base-plan access works but purchase permission returns package not found for intentional com.heykeys.app. Published paywall revision 12 remains defective; draft 13 has supported copy and legal links but Apple pricing/intro eligibility and native interactions are unverified. Keep publication/checkout gated. Webhook endpoints reject unauthorized requests, but real authenticated delivery/reconciliation/lifecycle proof is outstanding. Supabase connector lacks Auth settings/SMTP mutation capability; local CLI is authenticated to another account. Browser host access is unavailable and native app-control approval timed out. Do not loop on inaccessible dashboards or use the wrong account's CLI.

## Exact next-session actions

1. Read this document, PR #48's final handoff body, the three ledgers, HER_KEYS_PRODUCT.md and the required Sonnet handoff. Verify full 40-character PR head and convergence SHA, CI result and clean controlled worktree. Continue from the verified convergence candidate if merged; otherwise retain the pushed Codex checkpoint and finish validation before merge. Preserve original pins and unrelated worktree edits.
2. Reconcile the full source/backend/Production activation matrix with explicit PASS/FAIL/BLOCKED/NOT_RUN. Configuration enabled is not a completed journey. Do not redeploy newer files just because they differ.
3. Complete hostile auth/account-switch/reset/rebind/late-response/offline persistence tests; separately verify server cancellation and quota handling. Prioritize confirmed account-isolation problems as blockers.
4. Obtain correct Her Keys Auth management access; align Staging's reset template/sender/redirect, test actual app recovery including invalid/expired/used codes, then password change/login. Verify Production separately using only approved synthetic accounts. Extend live consent lifecycle checks without fabricating policy acceptance.
5. Resolve ASC credential and Play purchase-access diagnostics, validated paywall configuration, authenticated webhook delivery and entitlement reconciliation. Preserve identities; no anonymous purchase or unsafe checkout bypass. Native purchase certification stays NOT_RUN pending a signed artifact in the later authorized phase.
6. Verify complete real journeys for Today, Daily Load, One Move, Talk It Out, Smart Inbox, Momentum, calendar, onboarding and settings, including failures/recovery. Finish deployment/repair/regression/source ledgers, full source suite and exact-head CI before the eventual shared-system closeout. Do not start full independent platform audits or generate release binaries in this phase.
