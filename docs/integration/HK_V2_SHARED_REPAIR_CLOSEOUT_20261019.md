# Her Keys V2 shared repair closeout — October 19, 2026

The three inherited Premium Home failures are repaired. Five confirmed shared defects are closed, with 41 added regression tests and no new failures. This is ready for Build Manager source integration review. It is not EAS, native purchase, Production operations, or release approval.

- Entry: `559e50cdc99e7858b2b259f330a0fe2f8aa87513`, PR #35.
- Final executable repair: `c66caeccc72951d46470eef8eb94fb8fe388f239` (initial four repairs in `5cb2a02af790ecb6a710a120985a3e1795726745`, plus the final Momentum evidence repair).
- Branch: `repair/v2-shared-defect-closeout-20261019`.
- [Draft PR #38](https://github.com/herkeys/her-keys/pull/38), targeting PR #35's branch.
- Subsequent evidence/documentation commits do not alter the executable repair. The documentation-inclusive final review SHA and its latest exact-head Actions URL are pinned in PR #38's integration manifest after push; use that head for integration, not an inferred merge ref.

## Scope and protections

Shared app, Premium adapters, fixtures, security regressions, validation-only CI and evidence. No platform configuration, native source, dependency/lockfile, release identity allowlist, backend source, migrations, hosted configuration, subscription products/prices, checkout, deployments, EAS builds, store submissions, or merges changed. Account-deletion implementation, registry, fixtures, tests and runtime controls are untouched and remain independently owned.

The work used a new managed worktree, without altering the original dirty checkout or any other active worktree. Fetch confirmed the nominated source had not advanced. PR #32 (`d775b1fadea6e4d5b1da4a8e81738f539231a5e5`) and PR #34 (`23c5c279796d11ed37fe3c977d40112d3aa995bf`) are ancestors of this source. PR #35 is the exact base. PR #37 (`3bbc68b590c1ba160c2cb0e96e3488d873984c9d`) remains a separate iOS sibling, owned by iOS/Build Manager.

Expo's exact [v57 documentation](https://docs.expo.dev/versions/v57.0.0/) was read before code changes. No SDK/API migration was needed. Local runtime was Node 24.14.0; exact-source CI uses the repository's Node 22 setup and lockfile.

## Root causes and repairs

1. **SHR-V2-001 / SHR-PREM-01:** `tests/premiumHome/home.test.mjs:35` lacked `purchaseReadiness`. All three tests individually failed because `canOfferPurchase()` correctly denied an undefined response before invoking the scripted SDK. Supplying explicit authenticated `ready=true` only in positive fixtures restores the intended purchase/cancellation/error journeys. Seven additional tests exercise missing readiness, `ready=false`, checkout disabled, switching during readiness, and no-offering/cancellation/store-success without server entitlement. Existing closing-account, in-flight purchase-switch and single-flight controls remain.
2. **SHR-V2-002:** UI/controller lifetime checks discarded stale responses but did not constrain Supabase's later JWT injection. With an old actor scope and a replacement SDK session, all nine server/ledger operations could transmit as the replacement actor, including Smart Inbox text. `premiumRequestOwner.ts` now verifies the originating session against the keyed provider lifetime, bounds that lookup to eight seconds, and pins Authorization on RPC, Edge and receipt queries. `PremiumStateProvider` scopes both real transports. Twenty-seven installed-SDK tests cover mismatched actors, later token substitution and switches during lookup; the shipping-provider regression verifies lifetime wiring and invalidation. Before repair, 18/27 new transport tests failed; all 27 now pass.
3. **SHR-V2-003:** report submission relied on React state, allowing two same-frame callbacks to start two requests. A synchronous pending ref and successful-submission ref now prevent this. The server's existing durable deduplication remains unchanged. Error handling remains retryable with the same key, with explicit rate-limit feedback.
4. **SHR-V2-004:** a report form opened under A captured account identity only when Submit was pressed. A pre-submit switch could therefore submit A's response reference as B. The form now captures its originating account/household/binding, invalidates on any change, aborts pending work, disables stale actions and suppresses late receipts. Before repair, both new mounted report race tests failed; they now pass.
5. **SHR-V2-013:** Momentum requests 200 receipt rows, but the actual ledger adapter capped every read at 100. The installed-SDK regression returned only 100 of 101 real-shaped receipts, omitting evidence used for attribution. The adapter now honors the existing 200-row contract; the report regression verifies all 101 approved suggestions are counted. A saturated 200-row window is conservatively unavailable before authorization/save, because completeness cannot then be established. This avoids partial counts or attributing an omitted approved move to the user. Two additional regressions pass. Material limit: households that fill this bounded window receive the existing unavailable state; expanding/paginating historical evidence is not claimed here.

No entitlement is granted by these changes. Store success still starts bounded server reconciliation; only the server entitlement authorizes paid operations. Missing readiness remains denial. Production checkout was never toggled.

## Test evidence

| Validation | Entry | Final executable CI |
|---|---:|---:|
| Full tests | 5,152 | 5,193 |
| Passed | 5,141 | 5,185 |
| Failed | 11 | 8 |
| Premium Home inherited failures | 3 | 0 |
| Independent deletion failures, including parent failures | 8 | 8 |
| New regressions | — | 0 |
| Focused shared contracts | — | 1,159 / 1,159 |
| Launch-critical CI tests | 125 historically | 126 / 126 |

[Entry exact-SHA Actions](https://github.com/herkeys/her-keys/actions/runs/39091377651). [Final executable repair exact-SHA Actions](https://github.com/herkeys/her-keys/actions/runs/39213517785), head `c66caeccc72951d46470eef8eb94fb8fe388f239`: **FAIL only for the eight inherited deletion failures**. Install, backend protection, release identity, TypeScript, launch contracts, Expo install compatibility, Doctor 21/21, and public/native configuration all PASS. The [initial repair run](https://github.com/herkeys/her-keys/actions/runs/39212300521) had 5,191 / 5,183 pass / 8 inherited failures. Check the PR's latest head run after the evidence commit; an older run is not certification of a newer SHA.

Reproduced locally from fresh `npm ci`. Full `npm test` at a clean entry worktree matched historical CI exactly. A preliminary run with three newly written, unregistered evidence files also triggered the Meals ownership scanner; moving instrumentation outside the tree and rerunning cleanly restored the 11-failure baseline. The scanner still enforces every boundary; this sprint registers its exact dated evidence and source paths with reasons. A static readiness test was updated to follow the new actor-pinned RPC helper while retaining the RPC name, timeout, account check, pinned Authorization, server-readiness and paywall assertions.

Evidence is in `docs/integration/evidence/shared-closeout-20261019/`: individual original stacks, transport/report red regressions, local full-suite comparison, focused totals, exact-source CI steps/totals, and fresh read-only hosted observations. Full local raw logs remain in the task's Windows temporary directory; committed summaries contain commands/totals and failure locations without copying full SQL fixture diagnostics.

The 1,159-test focused run covers all `tests/premium`, `premiumHome`, `premiumDomain`, `premiumFinalConfig`, `platformParity`, `ai*`, `welcome*`, `consent*`, plus account runtime, bounded auth, email/password/OTP, account-bound Talk It Out capture, checkout, paywall feedback, sequencing, launch state, backend boundaries, migration chain, onboarding layout and AI behavior. It does not exclude or waive deletion tests from full CI.

Two later concurrent local runs reported the unchanged calendar performance growth-ratio assertion (ratios 25.9 and 22.5). The last local full run had 5,193 total / 5,184 pass / 9 fail, including that assertion; its isolated rerun passed 6/6, and exact-source CI passed the calendar test with only the eight inherited failures overall. Contention is a hypothesis, not a proven root cause. No timing threshold or test was changed or waived. This local reproducibility limit is SHR-V2-014; authoritative final pinned-Node CI totals are reported separately above.

## Shared journeys and actual backend contracts

| Journey | Source and executed contract evidence | Certification boundary |
|---|---|---|
| Daily Load | `dailyLoadFlow.ts`: authorize household/day, derive capacity/evidence, record intent, approve/apply through durable canonical commit, finish receipt; rejection has no household mutation; undo checks recorded before/after state. `tests/premiumDomain/dailyLoad{Review,Change,Flow,Ui}.test.mjs` cover empty/unavailable/Free denial, approval, rejection, persistence and undo. | Source/component/SQL contracts PASS; DEVICE_TEST_PENDING. |
| Smart Inbox | Real `smartInboxEnhancer.ts` and `premiumServerClient.ts` send typed text/context/household only through `smart-inbox-extract`; server handler authorizes entitlement, current AI consent, ownership and quota before provider access. Proposals remain subject to explicit approval. Client/server/evaluation/UI tests cover task/event/item proposals, replay, partial failures and actor switching. New installed-SDK tests protect the text transport itself. | Source/component/backend-handler contracts PASS; new hosted paid extraction and native interaction NOT_RUN. No synthetic paid entitlement created. |
| Momentum | `momentumFlow.ts` builds from recorded observations and receipt evidence, uses household logical dates, authorizes a ready weekly report, saves typed evidence and preserves saved history for expired users. Momentum domain/flow/UI/copy tests cover weekly windows, empty activity, truthful counts, no scores, save failures, household isolation and saved reviews. | Source/component/backend contracts PASS; native save/export interaction DEVICE_TEST_PENDING. |

Production readback confirms all three Stage 1 flags enabled/released/general with owner-approved limits (Daily Load 60/day, Smart Inbox 150/month, Momentum 31/month). Staging uses its existing staging-only tester guard. Comparing `premium_authorize` definitions identified precisely that existing staging-only membership guard, rather than a new defect or a reason to change Production business rules. Gates and ledger SQL execute in the existing disposable PostgreSQL harness; these tests do not establish a genuine store purchase.

Auth/Welcome tests cover Get Started versus returning account, Free/Premium intent, password/OTP/recovery/callback errors, legal/AI decision order, household binding, nonblocking RevenueCat activation, consumed-once intent, returning subscribers, logout, stale AI/entitlement completions and account/household switches. Existing fixes were retained; no additional shared routing defect reproduced.

## Fresh hosted readback and operational limits

- Both environments: `checkout_enabled=false`, `webhook_processing=true`, `premium_enabled=true`, test fixtures disabled. All five Premium/webhook/Ops endpoints in each environment rejected invalid authorization with HTTP 401; none returned the historical `503 not_configured`.
- Staging has two durable SANDBOX `ignored_test` events. Production has one SANDBOX `ignored_environment` event. No paid event was fabricated or replayed. Idempotency and invalid-HMAC behavior pass source tests; this sprint did not originate a valid signed provider event or run authenticated Ops with protected credentials.
- Production has one reconciled PRODUCTION projection with `has_entitlement=false`. This is not proof of a paying subscriber. The source reconciliation adapter uses RevenueCat `/v1/subscribers/{app_user_id}` with server-only credentials and an eight-second deadline; source tests verify parsing, retry/idempotency and account mapping.
- `herkeys-ai` artifacts match across environments (`6dc2998dd2b86faf54786aa9499ce8944c6fde47b87b64d560308a8877a30733`), and the downloaded handler matches source apart from final whitespace. Mandatory server AI-consent protections remain. No AI deployment occurred.
- Report submission/review RPC definition hashes match across environments. Both report tables have RLS enabled/forced; authenticated consumers can submit but cannot select the private queue; anonymous submission/readiness are denied. The daily `herkeys_ai_report_expiry` job is active at 03:19 UTC, with the existing 30-day expiry schema. Local SQL tests prove authorized-reviewer transitions, unauthorized/forged reviewer rejection, deduplication, rate limiting and expiration filtering.
- Staging report queue: six rows, five pending. Production: zero rows. Both environments currently have **zero server-authorized reviewers**. A named reviewer, cadence, response/escalation procedure, retention/privacy approval and signed-in Production consumer-to-review rehearsal remain operational handoffs. Reports carry metadata only; no conversation text was read or exposed.
- Existing webhook/Ops deployment bundle hashes differ between environments. Downloaded runtime differences concern the existing staging HMAC requirement; both enforce HMAC when actually configured as Production. Bundled admin-helper versions also differ from current source. This inherited parity boundary is recorded for the backend/Build Manager; no backend file or deployment changed in this sprint.

These observations supersede the older October 17 documents' obsolete webhook 503 and Production reporting-not-installed statements. No migration was reapplied. Current store catalog relationships and eight external handoffs are recorded in the separate handoff and defect ledger.

Overall sprint disposition is **PARTIAL** because reporting operations/native billing certification and the independent overall CI dependency remain incomplete. All confirmed in-scope shared repairs are fixed. `READY_FOR_BUILD_MANAGER_INTEGRATION=YES` means source review and governed convergence only; `READY_FOR_REAL_EAS_BUILD=NO`.
