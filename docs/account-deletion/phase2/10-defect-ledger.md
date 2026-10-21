# Account deletion Phase 2 — defect ledger (2026-10-20)

Mobile repair branch `repair/account-deletion-phase2-20261020` (stacked on PR #39 `e265f274671aa8caaec38d114613e9e31b275631`).
Website repair branch `repair/account-deletion-web-phase2-20261020` (stacked on PR #9 `c751f9e7eb18575ecc86e2bd4ad862349d648324`).
Phase 1 entries AD-001…AD-015 are in `../defect-register-20261019.md` and are not repeated. Their source repairs were re-reviewed and are retained unchanged.

Validation values: PASS / FAIL / NOT_RUN. "Source" means executable Node/SQL tests, not a device.

## DEL-P2-001 — Legacy Sign in with Apple accounts could never complete deletion

| Field | Value |
|---|---|
| Severity / type | **P1** / identity, provider, compliance (Apple 5.1.1(v), TN3194) |
| Ownership | Backend (deletion worker) |
| Location | `supabase/functions/_shared/deletionWorker.ts` (e265f27: lines 58–72, 95–119); `deletionCore.ts:6–8` |
| Evidence | Code trace at e265f27. With an Apple identity and no `apple_revocation_credentials` row, `apple_revoked` work threw `apple_revocation_requires_action` → `providersComplete=false` on every attempt. Before `max_attempts` (8, ~4h backoff) line 111 threw. At the ceiling Auth was deleted (114–117), then line 118 threw again, so `providers:true` was never written and SQL `finish` (requires `providers:true`) never ran. Requeue resets attempts and loops identically. |
| Root cause | **Proven** by trace and regression. Missing legacy revocation material was modelled as a retryable provider failure, not a terminal provider state. |
| Impact | Apple-linked users without a captured token (older sign-ins, failed capture) stay in `failed_requires_action` indefinitely. No terminal proof, no completion email (its outbox expires after 7 days), and the identity-bearing request row is retained indefinitely. Apple requires deletion to proceed without revocation material. Account content itself was already erased by `database_cleanup`. |
| Suggested repair | Treat "no usable Apple material" as a distinct settled outcome that never reads as revoked. |
| Actual change | `7b2fe25`: `settleAppleRevocation()` in `deletionProviders.ts`; `revokeApple` distinguishes Apple's `invalid_grant` (expired / already revoked) from outages; `apple_revoked='manual_revocation_required'` (never `true`); `providerSettled()` accepts that value **for `apple_revoked` only**; identity verification (Auth lookup or initiation snapshot) is still required first; outages, 429/5xx, `invalid_client` and an unconfigured key still retry. The completion email and in-app panel give manual revocation steps. The SQL terminal contract and five-field proof are unchanged. |
| Validation | **PASS (source)**: 4 new tests in `tests/accountDeletion/providers.test.mjs` (missing, expired, revoked, legacy, unavailable, misconfigured, mixed tokens, provider-specific settlement, worker routing, email/panel copy). Two mutants (old worker; settlement removed) are both killed. Deno type check of the four affected entrypoints passed. Full suite 5,237/5,237 at `9da9ea1`. Hosted Staging: **NOT_RUN** (no Her Keys Supabase access this session). |
| Production impact | Redeploy of `process-account-deletions` and every function importing `deletionCore.ts` (7, see manifest). No migration. |
| Release blocker | **YES**, for Apple submission and activation, until approved and deployed. |
| Outstanding approval | **Security/product approval** that `manual_revocation_required` satisfies Apple provider evidence. This changes what the approved provider-evidence contract accepts, so the brief requires sign-off before merge or deployment. |

## DEL-P2-002 — Google grants already removed by the user stalled deletion

| Field | Value |
|---|---|
| Severity / type | **P1** / provider, lifecycle |
| Ownership | Backend (deletion worker) |
| Location | `deletionProviders.ts:7–9` (e265f27); worker `google_revoked` block |
| Evidence | Google's revoke endpoint returns `400 {"error":"invalid_token"}` when the token is already invalid: the user removed Her Keys at myaccount.google.com/permissions, or the refresh token expired. `request()` mapped every non-2xx to `provider_unavailable`, so `google_revoked` could never settle. The stall then followed the same path as DEL-P2-001. |
| Root cause | **Proven** at source level (status mapping). Google behaviour per Google OAuth revocation documentation; live Google revocation stays owner-deferred (Phase 1 decision), so not reproduced live. |
| Impact | Any user who revoked Calendar access in Google before deleting Her Keys could never reach terminal completion. |
| Actual change | `9da9ea1`: `revokeGoogle` maps only an explicit `invalid_token` to `google_credential_unusable`; `settleGoogleRevocation()`; `google_revoked='credential_already_invalid'` (never `true`), accepted only for `google_revoked`. The completion email states the Google Account and calendar events are not deleted and links the permissions page. |
| Validation | **PASS (source)**: new test plus mutant killed. Hosted: **NOT_RUN**. |
| Production impact | Same 7-function redeploy as DEL-P2-001; no migration. |
| Release blocker | **YES** for activation (users can hit it). |
| Outstanding approval | Same security/product sign-off as DEL-P2-001. |

## DEL-P2-003 — Premium webhook events during the recovery window are de-identified irreversibly

| Field | Value |
|---|---|
| Severity / type | P3 / backend, Premium integration |
| Ownership | Backend (Premium + deletion) |
| Location | `20261019144729_account_deletion_v2_resource_certification.sql:96–120` (`deletion_redact_inactive_event`); `account_is_active` (`20261014014020…:4–8`) |
| Evidence | `account_is_active()` is false for any account with a non-`restored` request, including the 30-day `deactivated` state. The new BEFORE INSERT/UPDATE trigger on `premium_events` nulls that account's identifiers on every incoming RevenueCat event during the window. `refuse_pending_provider_write` also blocks entitlement writes. |
| Root cause | **Hypothesis on impact** (design reading, not hosted reproduction). Privacy-conservative by design, but restoration does not re-link those events. |
| Impact | A user who restores keeps working entitlements only after the next reconcile. Event history for the recovery window is permanently unlinked from them. No privacy harm; a minor support and analytics gap. |
| Suggested repair | Owner decision: either accept (document it) or redact only at purge time, not during `deactivated`. |
| Actual change | None. |
| Validation | NOT_RUN (hosted) |
| Release blocker | NO |
| Outstanding approval | Product: accept the current behaviour or schedule a design change. |

## DEL-P2-004 — Offline launch blocks a signed-in device; PR #39 also cancels reminders then

| Field | Value |
|---|---|
| Severity / type | P2 / lifecycle, iOS + Android |
| Ownership | Mobile |
| Location | `src/domain/account/deletionRuntime.ts:76–91`; `src/store/LocalNotificationProvider.tsx:112` (PR #39) |
| Evidence | When a session exists but `account_access_status` cannot be reached (offline, outage), the gate publishes `unavailable`, and `setAccountAccessBlocked(true)` blocks the app ("Account status unavailable… connect to the internet"). This predates #39 (present at c7dca1e). PR #39 additionally reconciles reminders with `enabled && kind==='active'`, so local reminders are cancelled whenever the status check is unreachable. |
| Root cause | **Proven** (code). Deliberate fail-closed posture; the reminder suppression is a new side effect. |
| Impact | An offline signed-in user is locked out of local data and loses scheduled reminders until connectivity returns. |
| Suggested repair | Owner decision. Option A: keep fail-closed. Option B: allow local read-only use and keep reminders when the last verified state was `active` and no deletion receipt exists. |
| Actual change | None (product semantics). |
| Release blocker | NO (not a deletion-correctness defect) |
| Outstanding approval | Product owner. |

## DEL-P2-005 — No independent watchdog for the deletion scheduler and monitor

| Field | Value |
|---|---|
| Severity / type | P2 / operations |
| Ownership | Operations |
| Location | `supabase/blueprints/account_deletion_scheduler.sql` (pg_cron + pg_net in the same project); `deletionMonitor.ts` |
| Evidence | The monitor, its alert email and `scheduler_stale` are all evaluated by jobs inside the same Supabase project. A stopped cron/pg_net/Resend path produces no signal. |
| Actual change | `6e074ae`: `scripts-dev/deletion-watchdog.mjs` plus `.github/workflows/account-deletion-watchdog.yml`. It calls the monitor with the existing HMAC from GitHub Actions every 30 minutes; anything other than an explicit `{healthy:true}` fails the run, and GitHub notifies the owners. It is inert until enabled, there is no `pull_request` trigger, and targets are pinned to the two projects. |
| Validation | **PASS (source)**: 5 tests. Live Staging call with a wrong key returned an authoritative 401 → `watchdog_unauthorized`, exit 1. Healthy-path live run: NOT_RUN (needs the real key as a GitHub secret). |
| Production impact | None until the owner merges to the default branch and sets `DELETION_WORKER_KEY` (secret) plus `DELETION_WATCHDOG_ENABLED` and `DELETION_WATCHDOG_PROJECT_URL` (variables). |
| Release blocker | YES for unattended activation (P3 gate) |
| Outstanding approval | Owner: add the secret and variables after merge; decide who receives GitHub failure notifications. |

## DEL-P2-006 — CRLF checkout breaks the four repair migrations

| Field | Value |
|---|---|
| Severity / type | P3 / backend, integration |
| Location | `.gitattributes`; the 4 `202610191*_account_deletion_*.sql` migrations |
| Evidence | Fresh worktree with `core.autocrlf=true`: 10 SQL test files failed with `classification_contract_mismatch` (281 CR bytes in the V2 migration). With an LF checkout, all pass. |
| Root cause | **Proven.** The migrations match normalized function text exactly; CRLF bytes break the match. It fails closed (the transaction aborts). |
| Impact | Local Windows verification, or a promotion run from a CRLF checkout, aborts. CI is unaffected. |
| Actual change | `5d40809`: `eol=lf` pins, following the repo's existing pattern. A fresh `autocrlf=true` clone now yields the exact approved LF checksums. |
| Validation | PASS |
| Release blocker | NO |

## DEL-P2-007 — Website PR #9 publishes legal text

| Field | Value |
|---|---|
| Severity / type | P2 / policy, website |
| Ownership | Legal + website |
| Location | Web `app/privacy/page.tsx` (new `#deletion-proof` section), `public/legal/her-keys-full-privacy-policy.html` (new retention notice), `content/site.ts` (privacy/terms contact = support email) |
| Evidence | Diff review of `origin/main...c751f9e`. |
| Impact | Merging PR #9 publishes privacy-policy wording that Legal has not approved (Phase 1 AD-011 is still open). |
| Suggested repair | Legal approves this wording before merge, or it is split out of the deletion PR. |
| Actual change | None (no autonomous legal edits). |
| Release blocker | YES for website publication |
| Outstanding approval | Legal. |

## DEL-P2-008 — Website shows raw browser and parser errors; service host not pinned on calls

| Field | Value |
|---|---|
| Severity / type | P3 / website |
| Location | Web `lib/deletion-client.ts:9–17` (c751f9e) |
| Evidence | Headless Chrome against a local production build: a blocked network showed "Failed to fetch"; an HTML 502 showed `Unexpected token '<' … is not valid JSON`. `deletionCall` did not apply the project allowlist that `deletionAuth` applies. |
| Actual change | Web `c3b2c83`: transport failures say a network error proves neither success nor failure; responses are parsed defensively; `deletionCall` refuses non-Her Keys hosts before sending any receipt or token. |
| Validation | PASS: 2 new web tests (both fail against c751f9e); browser checks 22/22. |
| Release blocker | NO |

## DEL-P2-009 — Web deletion is unusable for Apple "Hide My Email" users

| Field | Value |
|---|---|
| Severity / type | P3 / website, identity |
| Evidence | The web flow verifies ownership by email OTP (`shouldCreateUser=false`). An Apple relay-address user rarely knows that address. |
| Actual change | Web `c3b2c83`: the page explains where to find the relay address, or to use the in-app path or support. |
| Validation | PASS (build/lint/browser render) |
| Release blocker | NO (in-app path exists; the web resource requirement is Google Play's) |

## DEL-P2-010 — Android native journey cannot run in Expo Go

| Field | Value |
|---|---|
| Severity / type | P2 / validation infrastructure (not an app defect) |
| Evidence | The `HerKeys_UI02` AVD (API 37, swiftshader, 2 GB) cold-booted in ~490 s with the package manager ready, so Phase 1's boot failure was specific to `HerKeys_Runtime_B` and host memory. Expo Go 57.0.9 then failed: `Cannot find native module 'ExpoTopicSubscriptionModule'` (expo-notifications 57.0.23 Android), followed by the expo-router route error. |
| Root cause | **Proven**: the client runtime lacks a native module the current dependency set needs. |
| Suggested repair | A development build (`expo run:android` on a host with ≥8 GB free, or an EAS development profile), or an Expo Go build that includes the module. |
| Actual change | None (a build artifact or APK download needs owner authorization; host had 0.8–1.8 GB free RAM). |
| Release blocker | YES for `ANDROID_DELETION_NATIVE=PASS` |
| Outstanding approval | Owner: authorize a development build, or a newer Expo Go APK download. |

## DEL-P2-011 — PR #38 is red on its own; merge order is forced

| Field | Value |
|---|---|
| Severity / type | P3 / integration |
| Evidence | PR #38 exact-head run 39213975421 (`c7dca1e`) fails with `unclassified_resource` / `terminal_verification_failed`, the original eight deletion failures that PR #39 repairs. |
| Impact | PR #38 cannot go green into its base without PR #39. |
| Suggested repair | Merge #39 → `repair/v2-shared-defect-closeout-20261019` first; then #38 (now containing #39) → `repair/v2-ai-reporting-and-prod-convergence-20261017`. Retarget this Phase 2 PR to the #38 branch after #39 merges. |
| Release blocker | NO (governance) |

## DEL-P2-012 — Staging bundles now trail source

| Field | Value |
|---|---|
| Severity / type | P2 / operations |
| Evidence | DEL-P2-001/002 change `deletionCore.ts`, `deletionProviders.ts`, `deletionWorker.ts` (LF hashes in the manifest). Staging still runs the Phase 1 bundles (request 11 … process 14). |
| Suggested repair | After DEL-P2-001/002 approval: redeploy the 7 functions to Staging, read back hashes, run the Apple-legacy, Google-invalid and outage rows of the hosted matrix. |
| Release blocker | YES for Staging certification of Phase 2 changes |
| Outstanding approval | DEL-P2-001/002 sign-off, plus Supabase access (DEL-P2-013). |

## DEL-P2-013 — This session had no Her Keys Supabase or Vercel management access

| Field | Value |
|---|---|
| Severity / type | P2 / operations access |
| Evidence | The Supabase CLI is authenticated to the K Scan organization only. The Supabase connector requires an OAuth approval by the owner. The website's Vercel team `allonda` is not visible to the connected Vercel account, and the PR #9 preview is behind Vercel SSO. |
| Impact | Hosted Staging matrix, Production P0 read-only re-verification and preview validation are **BLOCKED**. Phase 1 hosted evidence is retained with its original dates. |
| Outstanding approval | Owner: approve the Supabase connector (link supplied in the session), and grant Vercel `allonda` access or share a preview bypass. |

## DEL-P2-014 — No handler for Sign in with Apple server-to-server notifications

| Field | Value |
|---|---|
| Severity / type | P3 / identity |
| Evidence | No endpoint handles Apple's `consent-revoked` / `account-delete` notifications (repository search). |
| Impact | Her Keys keeps a refresh token after the user stops using Apple sign-in. At deletion, Apple now answers `invalid_grant`, which settles as manual revocation via DEL-P2-001, so it is no longer blocking. |
| Suggested repair | A notification endpoint that verifies Apple's signed JWT and deletes the stored credential; configure it in Apple Developer. |
| Release blocker | NO |
| Outstanding approval | Apple Developer configuration owner. |

## Totals

Unresolved P0: **0**. Unresolved P1 release gates: DEL-P2-001 and DEL-P2-002 are source-repaired but **pending approval and deployment**; Phase 1 AD-009 (website not deployed) and AD-011 (legal) remain open. New regressions introduced by Phase 2: **0** (full suite green; see closeout).
