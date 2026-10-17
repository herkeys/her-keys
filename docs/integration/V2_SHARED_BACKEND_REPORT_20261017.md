# Her Keys V2 shared backend convergence — engineering handoff

Disposition: **repair candidate delivered; assignment certification blocked**. Do not nominate this source for platform certification or public release until the open owner gates below are resolved.

## Source and provenance

ENTRY_SHA: d775b1fadea6e4d5b1da4a8e81738f539231a5e5.
Branch: repair/v2-shared-backend-convergence-20261017.
[Draft PR #34](https://github.com/herkeys/her-keys/pull/34), targeting PR #32's exact integration branch.
Application repair SHA: fcdc7b9c4e0408f5a891c877849e97ab0a8d8891.
The evidence closeout commit follows that source checkpoint; use the exact final PR head and Actions SHA pinned in the final handoff, not an unpinned branch tip.

Commits:
- 22f14c3fd40c64f1a8f0b93969df719afeaa4bf5 — executable consent/provider safety regressions and entry inventory.
- fcdc7b9c4e0408f5a891c877849e97ab0a8d8891 — shared AI ownership fence, live release provenance, SQL tests, scoped validation lane and audit checkpoints.
- Final closeout — report, evidence logs and explicit denial-probe classifications; no additional application/backend behavior change.

PR #32 was checked twice against GitHub and fetched; it remained at ENTRY_SHA. No newer fixes or conflicts existed, no merge/rebase was necessary, and no unrelated branch was merged. PR #32 was not modified or force-pushed.
iOS PR #33 remains open at fecc8426229230d6b88548824a43f13ae27770f4 on audit/ios-v2-preflight-20261016 and was not modified.
The main workspace's unrelated local changes were preserved. The clean pre-existing requested repair worktree was moved inside C:/Users/jsmit/Her Keys/.worktrees/v2-shared-backend.

Only one shipped application file changed: src/store/TalkItOutContext.tsx. No app.json, eas.json, Info.plist, Android manifest, native folder, platform-only test/repair, account-deletion implementation/test, applied migration, product/price/offering or activation flag changed. No native binary/build/store command ran.

Changed files (including this closeout):
- .github/workflows/v2-integration-validation.yml
- docs/integration/V2_SHARED_BACKEND_AI_REPORTING_20261017.md
- docs/integration/V2_SHARED_BACKEND_LEDGER_20261017.md
- docs/integration/V2_SHARED_BACKEND_PROMOTION_20261017.md
- docs/integration/V2_SHARED_BACKEND_REPORT_20261017.md
- docs/integration/evidence/entry-full-suite.txt
- docs/integration/evidence/entry-functions.json
- docs/integration/evidence/fhhudicklmpofuzkxeqe-entry-ai-parsed.json
- docs/integration/evidence/fhhudicklmpofuzkxeqe-entry-migrations.json
- docs/integration/evidence/fhhudicklmpofuzkxeqe-entry-rpcs.json
- docs/integration/evidence/npykvnxnehlsdlbumzwk-entry-ai-parsed.json
- docs/integration/evidence/npykvnxnehlsdlbumzwk-entry-migrations.json
- docs/integration/evidence/npykvnxnehlsdlbumzwk-entry-rpcs.json
- docs/integration/evidence/shared-backend-certification-summary.json
- docs/integration/evidence/shared-backend-full-suite.txt
- docs/integration/evidence/shared-backend-negative-probes.json
- docs/integration/evidence/shared-backend-parity.json
- scripts-dev/meals-boundary-scan.cjs
- scripts-dev/shared-backend-negative-probes.mjs
- scripts/verify-release-identity.mjs
- src/store/TalkItOutContext.tsx
- tests/aiConsentHandler.test.mjs
- tests/releaseIdentity.test.mjs
- tests/releaseProvenanceRemote.test.mjs
- tests/sharedBackendSqlAuthorization.test.mjs
- tests/support/talkItOutBoundary.mjs
- tests/talkItOutAccountFence.test.mjs

## Confirmed issues, repair and ownership

The [issue ledger](V2_SHARED_BACKEND_LEDGER_20261017.md) contains entry/exit evidence and pass checkpoints.

| ID / priority | Root cause and reproduction | Repair / test result | Final classification, residual risk and owner |
|---|---|---|---|
| S02-01 / P1 | Both downloaded AI deployments retain conditional consent; entry source is unconditional | Staging deployed v11; exact downloaded file comparison PASS; 18 shipping-handler regressions PASS | CONFIRMED_DRIFT, Staging repaired; Production pending approval and authenticated E2E blocked. Shared backend / Build Manager |
| S02-02 / P1 | Late AI completions/retries dispatch against global current household after original owner/session ends; four red mounted reproductions | Invalidate on unmount/ownership changes, fence account/household/binding, clear stale retry content. Ten mounted ready/unavailable/switch/rebind/retry tests PASS; Free fallback PASS | CONFIRMED_DEFECT repaired. Live synthetic session test outstanding. Shared source |
| S03-01 / evidence gap | Provider-originated signed/authenticated delivery and real subscriber reconciliation not demonstrated | 119 exact handler/auth/projection/reconcile/gate tests PASS; provider event ID dedupe also executed in disposable SQL | UNVERIFIED / BLOCKED_TEST for live positives. Billing/backend |
| S03-02 / P1 | Both live webhook and ops endpoints return 503 not_configured before payload handling | Fail-closed denial verified; exact missing config field unknown; no secret rotation/destination changes made | CONFIRMED_DEFECT, unresolved configuration blocker. Approved Staging secrets/provider test traffic required; Production separately controlled. Billing/backend configuration owner |
| S04-01 / P2 | Whole shared UI/backend inventory has no safety-report submission/review path | Inventory and policy comparison completed; concrete common contract prepared; no inert control or unmonitored collection added | CONFIRMED_DEFECT, unresolved. Reviewer owner, actual monitored destination, retention and attachment approval required. Product/privacy + shared backend |
| S05-01 / audit | Migration counts differ, functional hosted account matrix unavailable | Catalog comparison, effective-role denial probes and complete-chain disposable SQL executed; differences explained below | PASS for scoped structure/source checks; complete live authorization NOT_RUN. Shared backend |
| S05-02 / unassigned | Both Premium bundles use earlier supabaseAdmin helper than the candidate; gate/reconcile use earlier runtime copy | Source/deployed files compared; no wholesale redeployment that would alter excluded lifecycle behavior | CONFIRMED_DRIFT; harmful path/priority UNVERIFIED. Coordinate shared/deletion owners; deletion-related repair DEFERRED |
| S06-01 / P2 internal, P1 release | Old exact branch allowlist does not nominate V2 | Proposed candidate/v2-shared-backend-convergence-20261017 in ledger only; no allowlist entry added | CONFIRMED_DRIFT / owner nomination PENDING_APPROVAL. Build Manager |
| S06-02 / P2 | --release trusts cached @{u} and omits backend checks outside EAS_BUILD | Require full SHA, live exact upstream, Production/client config/empty data/consent. All 15 release tests PASS | CONFIRMED_DEFECT repaired; no release/build authorization granted. Shared release governance |
| EX-01 | Eight inherited deletion failures | Unchanged and reproduced | DEFERRED, deletion owner |
| EX-02 | Three inherited Premium Home failures | Unchanged and reproduced | DEFERRED, separate Premium Home shared owner |

Two newly confirmed in-scope defects remain open (S03-02 configuration and S04-01 reporting). Zero new regression failures remain. Production AI drift is a separate known promotion gate. The helper/lifecycle drift has not been assigned a harmful P0–P3 outcome.

## Backend deployments and parity

Projects: Staging fhhudicklmpofuzkxeqe; Production npykvnxnehlsdlbumzwk.

| Function | Staging / Production version | Downloaded bundle SHA256 |
|---|---|---|
| herkeys-ai | 11 / 7 | Staging f7b98ea09472119d2005a9f7b990d1264d25e654efa1f694094a0c767b26da14; Production 74cc1b82cc77c1e02c480bef2675df7cc3d9422ee35675e8fa0328028a83a16c |
| premium-gate | 1 / 1 | 366307e1be3369f38031d3f29bd835a89568e703d272101021189b9202264bab (both) |
| premium-reconcile | 1 / 1 | c115d42e4fb4d91ed52696153d3f0466bd0f0790ccaacd5657b104a2ffd07cab (both) |
| smart-inbox-extract | 1 / 1 | 52f7187bf041051d088c694c09145e41d3947920fefe4660075e725992e976e8 (both; metadata inventory) |
| revenuecat-webhook | 2 / 1 | Staging 88e1c2283dc4e58a58c1730a74c8377b20fd394a71d994f392c4a94d3a82d49c; Production 0261ac7e7b20dfe54c08ec6fc1e5792ebe9ab305771af379d487d5dabb5fd694 |
| premium-ops | 2 / 1 | Staging 9374b81f67b4987cc666bdc2b2f019d0d5d0f4e49105479df2371131661d82c4; Production 65a8829ac70012f1b515a5d7965e65edb018fcc2a6f63cba11ed9f30e2760557 |

AI/gate/reconcile/Smart Inbox JWT verification=true; webhook/ops=false with application-level sender/operator authentication.
Only Staging herkeys-ai was deployed. Its three downloaded source files exactly equal the tested files. Their raw and canonical LF hashes are in the [promotion manifest](V2_SHARED_BACKEND_PROMOTION_20261017.md).

Actual catalog comparisons: 76/77 relations, 1,147/1,154 columns, 189/189 identical RLS policies, 71/71 functions. Shared table/column structures, relation RLS/options/grants and API-schema grants match exactly.
Production's additional welcome-email receipt table, seven columns and service-only claim RPC are intentional outbound-email infrastructure; preserve Staging suppression.
Staging premium_authorize adds the server-owned tester metadata restriction and a service-only readiness helper. Production intentionally permits the approved general rollout. Purchase-readiness function definitions are identical and checkout_enabled=false in both live runtime rows.
The three Stage 1 features remain enabled/released with staging_only/controlled_test versus general/owner_approved rollout metadata. Village and Co-Parent Plus remain unreleased. No activation flags changed.

Webhook/ops source differs across projects only in the shared runtime requiring HMAC for Staging as well as Production. It is a deliberate stronger Staging configuration; Production already requires HMAC when declared production. Actual PREMIUM_ENVIRONMENT secret values and credential compatibility are not established by DB runtime rows.
Both Premium deployments carry older auth helpers than the candidate; gate/reconcile also carry an earlier runtime copy. These have not been indiscriminately synchronized, particularly where lifecycle/deletion ownership applies.

32/29 hosted migration entries use historical apply timestamps/names rather than the canonical repository versions. Full chain applies in order to disposable embedded PostgreSQL. Structural fingerprints explain shared differences; counts alone do not imply missing schema. Deletion fixture/scheduler history stays deferred. No migration was edited, added or applied to a hosted project.

Privileged RPC results: anon/authenticated cannot directly execute service-only authorize/projection/event/reconcile functions. Consumer ledger RPCs derive auth.uid() and check ownership/authorized usage; search_path is explicit. No service-role grants were removed. Both hosted effective authenticated-role/no-subject probes returned account_unavailable and zero visible consent; premium_events SELECT failed 42501. These limited negatives are not signed-in A/B proof.
Disposable SQL applied the full chain and passed consent owner append/read/withdrawal, forged timestamp/update/delete denial, household A/B read/write isolation, service RPC denial, decision ownership, missing auth, checkout readiness and event dedupe checks. No hosted test users, entitlements or purchase records were manufactured. Native Docker/psql multi-connection harness remains BLOCKED_TEST because the Docker daemon is unavailable; PGlite is not evidence of real multi-connection races.

Raw structural comparison, grants, hashes and role results: [parity evidence](evidence/shared-backend-parity.json).
Safe denial request IDs/status/latency: [probe evidence](evidence/shared-backend-negative-probes.json).

## AI consent, safety and reporting

Server ordering reviewed: validate trusted bearer identity/account, read account-scoped latest ai_processing receipt, require current ai-data-processing-initial-v1 affirmative decision, then check configuration/request and invoke Gemini. No environment bypass/client consent authority. Missing/denied/withdrawn/outdated/wrong-account/unreadable decisions make zero provider fetches in executed shipping-handler tests. Provider failures/retries/timeouts and unsafe structured responses are rejected honestly, without fabricated success.
Live gateway missing/invalid JWT probes return 401 in both environments. Other authenticated consent-negative/positive cases, expired-session fixture, actual provider failure/timeout/retry and real Gemini result are BLOCKED_TEST/NOT_RUN without approved synthetic identities.

No Gemini invocation occurred. Only empty invalid denial payloads and deliberately invalid synthetic credentials were sent to hosted endpoints; no real user content, valid bearer token, provider secret or private account information was logged.
[Reporting inventory](V2_SHARED_BACKEND_AI_REPORTING_20261017.md) explains Talk It Out's confirmed gap, Smart Inbox productivity scope, deterministic recommendation surfaces, policy sources and the exact data/reviewer decision needed. No new sensitive collection/retention was introduced.
Production manifest is prepared but explicitly **not eligible for approval/promotion until Staging E2E certification completes**. It includes exact hashes, safe verification and rollback/recovery preserving unconditional consent.

## Billing

[RevenueCat project webhook inventory](https://app.revenuecat.com/projects/93809efe/integrations/webhooks): two correct destinations with sandbox/production filtering; descriptive pending labels are not authentication evidence.
Authorization-header plus HMAC format verified against [RevenueCat's current documentation](https://www.revenuecat.com/docs/integrations/webhooks). No protocol invented.
Source tests establish credential rejection, byte-exact HMAC, durable environment/event ID dedupe, account/alias/transfer isolation, delayed/reordered lifecycle/refund handling, CAS retry and temporary-failure recovery. They do not prove actual sender configuration.
Both live destinations and ops fail closed as not_configured. No positive provider delivery, real customer reconciliation or paid feature activation is certified. Checkout remains OFF in both databases. No offering/product/price/trial/entitlement ID/destination changed, no live purchase, no manually granted paid access.

## Source certification

Fresh npm ci PASS (587 installed); package/lockfile unchanged.
TypeScript PASS; Deno 2.8.2 checks PASS for AI/webhook/reconcile/gate/ops.
Full suite: **5,087 total / 5,076 passing / 11 failing / zero new failures**. All 45 added checks pass. Local final run uses four test workers with every test/assertion unchanged.
[Exact application-source CI](https://github.com/herkeys/her-keys/actions/runs/39047921590), SHA fcdc7b9c4e0408f5a891c877849e97ab0a8d8891: same totals, same inherited failures. Exact final-head CI is pinned in the final handoff.
Launch-critical 125/125 PASS; targeted consent/AI 51/51 PASS; webhook/reconcile/gate 119/119 PASS; SQL 12/12 PASS; release 15/15 PASS; account-fence 10/10 PASS.
Welcome Tree, Premium permission/identity/state, consent, AI schemas/behavior, migration-chain, theme and boundary tests run in the complete suite. Shared-state message tests cover Free, Premium active/pending/expired/unavailable, denied consent/provider failure and household refusal; they are shared source evidence, not native device certification.
Expo install --check PASS. Expo Doctor 21/21 PASS locally and CI. Resolved Expo public/native config checks PASS in CI; no binary built.
CI workflows retain all original gates. Exact repair branch is added only to validation. Production release allowlist stays exactly build/02-gemini-integration; unapproved branch prefixes/dirty source/missing upstream/stale remote/wrong identity/backend/missing consent remain rejected.

Failures by owner:
- Deletion (8 including failed parent test nodes): database cleanup/terminal evidence, shared-policy mutation control, three resource coverage variants. Unchanged paths tests/accountDeletion/database.test.mjs, mutations.test.mjs, resourceCoverage.test.mjs.
- Premium Home (3): purchase interface request, cancellation words, unavailable offering words in tests/premiumHome/home.test.mjs. No delegated repair.
- New failures: 0. CI remains red; no exception or waiver applied.

An initial unbounded-worker run also hit a calendar timing failure and newly added evidence's unregistered boundary. The unchanged calendar test passes in isolation and final full suite; the assigned boundary lane is now registered. A first actor-key implementation tripped an existing privacy source assertion and was corrected without modifying that assertion; final full suite confirms it passes. Initial and final full logs are preserved.

## Final gates and status contract

Outstanding owner inputs:
1. Legitimate approved Staging synthetic account credential configuration/provisioning, including A/B households, Free/Premium tester and consent states.
2. Approved Staging webhook/HMAC/ops configuration and provider-originated sandbox test delivery; then account-safe reconciliation and recovery rehearsal. Production remains a separate approval.
3. Reporting reviewer owner, monitored destination, approved retention/attachment policy. Then implement and certify the common reporting workflow.
4. After certification, Build Manager nominates and approves one exact release branch and independently approves any Production promotion. No such authorization is granted here.

SHARED_SOURCE_REPAIR=FAIL
AI_CONSENT_SOURCE=PASS
AI_CONSENT_STAGING_DEPLOYED=PASS
AI_CONSENT_STAGING_E2E=NOT_RUN
AI_CONSENT_STAGING=NOT_RUN
AI_CONSENT_PRODUCTION_PARITY=PENDING_APPROVAL
AI_CONSENT_PRODUCTION=PENDING_APPROVAL
AI_CONSENT_REAL_LLM=NOT_RUN
AI_REPORTING_EXISTING_CAPABILITY=NOT_FOUND
AI_REPORTING_GAP_CONFIRMED=YES
AI_REPORTING_SHARED_UI=FAIL
AI_REPORTING_BACKEND=FAIL
AI_REPORTING_POLICY_REVIEW=PENDING
AI_REPORTING=FAIL
RC_WEBHOOK_AUTHENTICATION=NOT_VERIFIED
RC_WEBHOOK_SECURITY=NOT_VERIFIED
RC_WEBHOOK_IDEMPOTENCY=NOT_RUN
RC_WEBHOOK_ACCOUNT_ISOLATION=NOT_RUN
RC_RECONCILIATION=NOT_RUN
RC_STAGING_PRODUCTION_PARITY=INTENTIONAL_DIFFERENCE
DATABASE_STRUCTURE_PARITY=PASS
DATABASE_FUNCTIONAL_PARITY=NOT_RUN
RLS_AUTHORIZATION=NOT_RUN
PRIVILEGED_RPC_SECURITY=NOT_RUN
MIGRATION_CHAIN=PASS
ENVIRONMENT_DIFFERENCES_DOCUMENTED=YES
RELEASE_BRANCH_NOMINATION=PENDING
EXACT_RELEASE_BRANCH_ALLOWLIST=PENDING_APPROVAL
RELEASE_PROVENANCE_NEGATIVE_TESTS=PASS
RELEASE_IDENTITY_GUARDS=PASS
RELEASE_BRANCH_GOVERNANCE=PENDING_APPROVAL
PRODUCTION_BUILD_AUTHORIZATION=NOT_GRANTED
SHARED_NEW_P0_P3_DEFECTS=2
ACCOUNT_DELETION=DEFERRED
CHECKOUT_ENABLED=FALSE
RC_CHECKOUT_ENABLED=FALSE
ANDROID_PLATFORM_REPAIRS=UNTOUCHED
IOS_PLATFORM_REPAIRS=UNTOUCHED
READY_FOR_PLATFORM_HANDOFF=NO
READY_FOR_PUBLIC_RELEASE=NO

FAIL on overall source repair means the assignment's confirmed reporting/configuration gaps and certification prerequisites remain open; the implemented source repairs have zero new regression failures. It is not a claim that untested features failed.

