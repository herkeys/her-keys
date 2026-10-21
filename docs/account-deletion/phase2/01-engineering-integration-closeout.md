# Account deletion Phase 2 — engineering and integration closeout (2026-10-20)

## Source lineage (verified against GitHub at execution time)

| Item | SHA | State |
|---|---|---|
| PR #37 (iOS Photos) `audit/ios-v2-pr35-readiness-20261019` | `3bbc68b590c1ba160c2cb0e96e3488d873984c9d` | Draft, independent: touches only `app.json` and `tests/ios/nativeConfig.test.mjs`; **no overlap** with #39 or Phase 2 |
| Shared base `repair/v2-ai-reporting-and-prod-convergence-20261017` | `559e50cdc99e7858b2b259f330a0fe2f8aa87513` | Base of #37 and #38 |
| PR #38 `repair/v2-shared-defect-closeout-20261019` | `c7dca1ec13956e16e03b66ae64346be73829e077` | Draft; exact-head CI **FAIL** (run 39213975421: the original deletion failures) |
| PR #39 `repair/account-deletion-crossplatform-closeout-20261019` | `e265f274671aa8caaec38d114613e9e31b275631` | Draft; exact-head CI **PASS** (run 39282406729); unchanged since the brief |
| **Phase 2 mobile** `repair/account-deletion-phase2-20261020` | `5d408090325a11f44feb306711e9749f42b02692` (code), + docs commit | Stacked on #39 |
| Website PR #9 `repair/account-deletion-web-closeout-20261019` | `c751f9e7eb18575ecc86e2bd4ad862349d648324` | Draft; exact-head CI **PASS** (run 39278472014); unchanged |
| **Phase 2 website** `repair/account-deletion-web-phase2-20261020` | `b865fd7` | Stacked on PR #9 |

Linear ancestry confirmed: `559e50c ⊂ c7dca1e ⊂ e265f27 ⊂ Phase 2`. No newer shared V2 branch exists on origin after #39.

**Integration order (required):** (1) PR #39 → `repair/v2-shared-defect-closeout-20261019`; (2) Phase 2 PR, retargeted to the same branch; (3) PR #38 → `repair/v2-ai-reporting-and-prod-convergence-20261017`, now green because it carries #39 (DEL-P2-011); (4) PR #37 independently. Website: Phase 2 web → PR #9 branch → `main`. **Nothing was merged.** All PRs are drafts without approvals, which is reason enough not to merge.

## Phase 1 review result

The full PR #39 source diff (27 non-documentation files) was reviewed: 4 migrations, registry, terminal verifier, provider acknowledgement and recovery, shared ownership, secure storage, notifications, runtime, account lifecycle, CI and scanner, tests.

- **Privileged SQL:** every new `SECURITY DEFINER` function has `search_path=''` and EXECUTE revoked from PUBLIC/anon/authenticated/service_role. New private tables have RLS on with ALL revoked. Patched functions are rebuilt from `pg_get_functiondef` behind contract-mismatch guards, so definer, search path and grants are preserved.
- **Fail-closed preserved:** unknown public/private relations and global exceptions holding identity columns raise `unclassified_resource` / `unclassified_relationship`. Only the one reviewed optional table may be absent.
- **Scope:** the changes are limited to deletion plus necessary boundaries (Premium cleanup triggers, scanner/CI registration).
- **Findings raised:** DEL-P2-001 (Apple legacy stall, P1), DEL-P2-002 (Google invalid token stall, P1), DEL-P2-003 (Premium events during recovery, P3), DEL-P2-004 (offline gate and reminder cancellation, P2), DEL-P2-006 (CRLF, P3). The website review raised DEL-P2-007 (legal text, P2), DEL-P2-008 and -009 (P3).
- Every Phase 1 repair (AD-001…AD-014) is retained unchanged; no assertion was relaxed.

## Phase 2 commits

| Commit | Change |
|---|---|
| `7b2fe25` | DEL-P2-001: Apple manual-revocation settlement, `invalid_grant` handling, user instructions |
| `9da9ea1` | DEL-P2-002: Google `invalid_token` settlement, completion-email Google line |
| `6e074ae` | DEL-P2-005: external watchdog script + inert scheduled workflow; integration gate includes this branch |
| `5d40809` | DEL-P2-006: `eol=lf` pins for the four repair migrations |
| web `b865fd7` | DEL-P2-008/009: error handling, host allowlist on every call, Apple relay guidance (CI workflow edit deferred: needs a `workflow`-scoped token, W-1) |

## Test evidence

| Check | Result | Evidence |
|---|---|---|
| Full app suite (serial) at `5d40809` | **PASS 5,243/5,243**, 0 fail/skip/cancel | `evidence/full-suite-summary.txt` |
| New regressions | 10 tests (5 provider, 5 watchdog); 3 mutants killed (old worker, Apple settlement removed, Google settlement removed); web 2 tests fail on c751f9e | `tests/accountDeletion/providers.test.mjs`, `watchdog.test.mjs`; web `tests/deletion-client.test.mjs` |
| All 50 resource fixtures, shared/former-member negative controls, retention, V2 resources, AI review, shared SQL auth (real embedded PostgreSQL) | PASS (inside the full suite; also 104/104 + 27/27 targeted) | — |
| TypeScript (`tsc --noEmit`) | PASS | — |
| Deno type check: process, capture-apple, monitor, request | PASS | — |
| Meals boundary scan | PASS | — |
| Website: typecheck, lint, build, 4 tests | PASS | — |
| Website browser checks (local prod build vs Staging) | **22/22** | `evidence/web-deletion-check.json`, screenshots |
| Expo Doctor / compatibility | NOT_RUN in Phase 2: no dependency change since Phase 1's 21/21 | Phase 1 `../evidence/expo-doctor.txt` |
| Exact-head GitHub CI (Phase 2 branch) | **Pending**: runs on push via `v2-integration-validation.yml` | See PR |
| Hosted Staging | **BLOCKED** (DEL-P2-013) | `02-staging-certification.md` |
| iOS native | NOT_RUN (no macOS) | `04-apple-compliance-report.md` |
| Android native | NOT_RUN: emulator boots; Expo Go incompatible (DEL-P2-010) | `evidence/android-native-attempt.txt` |

Environmental note: one run on a CRLF checkout produced 10 SQL failures, all `classification_contract_mismatch`. That reproduced DEL-P2-006, which is now fixed. A second run had 2 failures caused by this session swapping `node_modules` mid-run. The clean rerun was 5,243/5,243. No genuine test failure was observed.

## Final certification gates

**A — Source:** `DELETION_SOURCE=PASS`

**B — Staging:** `STAGING_DELETION_E2E=BLOCKED`. Minimum: Supabase access, then DEL-P2-001/002 approval, then redeploy 7 functions to Staging and run the 7 remaining hosted rows.

**C — iOS:** `IOS_DELETION_SOURCE=PASS` · `IOS_DELETION_NATIVE=NOT_RUN` (needs macOS/Xcode or a device with an internal build; plan in report 04) · `APPLE_REVOCATION=NOT_VERIFIED` (owner-deferred live test, plus Apple Developer config check)

**D — Android:** `ANDROID_DELETION_SOURCE=PASS` · `ANDROID_DELETION_NATIVE=NOT_RUN` (needs a development build or a compatible Expo Go) · `GOOGLE_PROVIDER_CLEANUP=NOT_VERIFIED` (owner-deferred live test)

**E — Website:** `WEBSITE_SOURCE=PASS` · `WEBSITE_PUBLIC_DELETION=NOT_DEPLOYED` · `WEBSITE_RESTORE=NOT_DEPLOYED`. Minimum: Legal approval of PR #9 text, backend P1, owner-authorized publication, public re-verification.

**F — Production:** `PRODUCTION_MIGRATION_READY=YES` · `PRODUCTION_FUNCTION_READY=NO` (approval + Staging re-cert) · `PRODUCTION_NONDESTRUCTIVE_PROMOTION_APPROVED=NO` · `PRODUCTION_DESTRUCTIVE_PROCESSING=OFF` (last verified 2026-10-19) · `PRODUCTION_ACTIVATION_READY=NO`

**G — Operations and policy:** `INDEPENDENT_WATCHDOG=BLOCKED` (built; owner secret/variables after merge) · `PROVIDER_ERASURE=PARTIAL` · `APPLE_POLICY=PARTIAL` · `GOOGLE_PLAY_POLICY=BLOCKED` · `LEGAL_DISCLOSURES=PENDING`

**H — Integration:**

```
FULL_EXACT_HEAD_CI=NOT_RUN            (local full suite PASS; GitHub run starts on push — see PR)
NEW_REGRESSIONS=0
UNRESOLVED_P0=0
UNRESOLVED_P1=4                       (DEL-P2-001, DEL-P2-002 repaired but pending approval+deploy; AD-009 website; AD-011 legal)
MOBILE_SOURCE_SHA=5d408090325a11f44feb306711e9749f42b02692   (code; docs commit follows)
WEBSITE_SOURCE_SHA=b865fd71c4f8a69ef268b8fd711fd270f34fe6f7
REPAIR_BRANCH=repair/account-deletion-phase2-20261020
REPAIR_PR=see PR description
READY_FOR_BUILD_MANAGER_INTEGRATION=NO   (drafts; needs review approvals, DEL-P2-001/002 sign-off, green exact-head CI, merge order above)
READY_FOR_CONTROLLED_PRODUCTION_PROMOTION=NO
READY_FOR_PUBLIC_DELETION_ACTIVATION=NO
```

## Minimum actions to turn each NO into YES

1. **Security/product owner:** approve DEL-P2-001/002 semantics, including the A-1 interaction in the Apple report.
2. **Owner:** approve the Supabase connector (Staging redeploy and hosted rows; Production P0) and grant Vercel `allonda` preview access.
3. **Reviewers:** review and approve #39, the Phase 2 PR, #38 and web #9 + Phase 2 web; merge in the stated order once exact-head CI is green.
4. **Legal:** approve L-1…L-7 and the PR #9 legal text.
5. **Owner:** approve the P1 manifest; afterwards publish the website and re-verify the public URL.
6. **Owner:** authorize a development build (Android) and provide a macOS/iOS device path; run the native plans.
7. **Owner:** decide on live Apple/Google revocation tests (or accept the deferral); enable the watchdog; approve P2 and later P3 separately.
