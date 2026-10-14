# HER KEYS — AUTONOMOUS ACCOUNT DELETION & RECOVERY BUILD PLAN

## Assignment and execution contract

When instructed to execute this plan, act as the implementation owner. Build, test, repair, and certify the complete mobile, backend, website, email, and scheduled deletion lifecycle specified in the requirements appendix. Do not stop after producing architecture, scaffolding, a worker, or a list of recommendations.

This document is an execution-ready plan. Creating or reading it does not itself deploy services, start a recurring agent automation, or authorize Production operations.

Proceed autonomously through isolated source implementation and safely scoped Staging certification. Make routine engineering decisions from repository evidence, document assumptions, and continue independent work when one dependency is blocked. Do not request approval between routine source tasks or after each phase. Preserve the explicit approval boundaries below. Never equate autonomous engineering with unrestricted Production authority.

Before writing code, read repository instructions and the exact Expo SDK 57 documentation at https://docs.expo.dev/versions/v57.0.0/, including the relevant versioned module pages. Inspect installed dependencies; do not silently upgrade Expo or alter app identity. Read applicable Supabase, RevenueCat, email, and platform skills before work in those domains. Verify current external API and store-policy contracts against official documentation during implementation.

All original functional, security, platform, testing, and certification requirements are retained in the appendix. The execution contract makes them actionable; it does not waive them. If an implementation detail conflicts with verified repository behavior, document the discrepancy and resolve it safely. Material privacy or ownership ambiguity requires a product decision; never invent a retention or ownership-transfer policy.

## Authority and approval boundaries

| Action | Execution authority |
| --- | --- |
| Inspect repositories, fetch refs, inspect schema and service configuration | Proceed using available authorized access; never print secrets or customer records |
| Isolated source changes, migrations in source, local tests, documentation, reviewable commits, exact-SHA CI | Proceed; inspect CI first and prevent unintended deployment or destructive jobs |
| Staging migrations, functions, scheduler, and disposable fixtures | Proceed only after verifying project `fhhudicklmpofuzkxeqe`, isolation, available authorization, and safe test scope |
| Source implementation acceptance and Staging certification | Separate evidence gates; neither grants Production authority |
| Production migrations or deployment to `npykvnxnehlsdlbumzwk` | Requires explicit owner approval of the concrete revision and deployment manifest |
| Controlled Production disposable-account certification | Requires explicit scope covering the named synthetic account and destructive test; no real customer account may be used |
| Enable or re-enable unattended destructive Production processing | Requires separate explicit owner approval after reviewing certification and activation configuration |
| EAS execution, store builds, store submission, publishing | Prohibited under this assignment |

An approved feature-branch push, successful source review, or Staging PASS never supplies Production approval. Record approvals by scope, revision, environment, and conditions. Ask only for missing access, unresolved consequential product decisions, or an explicit approval gate. Complete the reviewable package and all independent work before presenting the gate.

## Durable execution record

Create `docs/account-deletion/` in the isolated mobile checkout, with corresponding website references where useful. Maintain these artifacts throughout execution:

- `execution-state.json`: phase, task states, repository/branch/worktree paths, ENTRY and current SHAs for both repositories, deployed revision, environment, blockers, evidence paths, and next safe action. Never store tokens, customer emails, secrets, or recovery receipts here.
- `task-register.md`: requirement-to-task mapping, dependencies, acceptance checks, and evidence. Every appendix requirement must map to a task and result.
- `architecture.md`: actual ownership model, account state, transition table, trust boundaries, request/restore/worker dataflows, local-device behavior, and failure reconciliation.
- `resource-registry.md`: complete schema/storage/provider census with exact ownership, cleanup order, sharing/retention policy, verification, and retry behavior.
- `security-report.md`, `test-evidence.md`, `automation-certification.md`, `production-handoff.md`, and `certification-results.txt`.

Use task states `TODO`, `IN_PROGRESS`, `BLOCKED`, `PASS`, and `FAIL`. A PASS requires linked evidence tied to the tested revision and environment. Record baseline failures separately. A blocked device or provider test stays unexecuted; it cannot become PASS through a mocked substitute.

On resumption, read the execution record, reconcile it with Git and deployed state, and continue from the first incomplete dependency. Never replay a migration, provider mutation, or purge solely because a conversation restarted. Preserve logs with redaction and sufficient retention for review.

## Dependency-ordered work packages

| ID | Work and dependencies | Required exit evidence |
| --- | --- | --- |
| T00 | Read instructions; inspect both repositories and active worktrees; fetch refs; identify integration authority; compare historical Android/iOS repairs; create isolated `codex/` feature branches without changing auditor checkouts | ENTRY SHAs, clean isolation, baseline commands/results, unresolved integration risks |
| T01 | Census actual Build 4 schema, RLS, RPCs, functions, sync, storage, providers, immutable ledgers, and local persistence; inspect reference architecture only if authorized and available | Architecture and resource registry covering every discovered resource; sharing ambiguities explicitly identified |
| T02 | Define lifecycle and API contracts using T01; enumerate every transition, actor, precondition, deadline comparison, idempotency rule, lease/fence rule, and failure recovery | Reviewable transition table and API/error contracts; exact acceptance cases |
| T03 | Implement additive ledger/state schema, constrained privileged helpers, account-state access guards, receipts, request idempotency, recent-auth verification, and transactional email outbox using T02 | Database and API tests proving immediate restriction, stale-JWT refusal, privilege isolation, and no grace reset |
| T04 | Implement restoration, resend, receipt-bound status, rate limits, token rotation, and Auth reconciliation using T03 | Single-use/concurrency/deadline tests; generic public responses; unban failures remain pending |
| T05 | Implement resource cleanup adapters, bounded worker, leases/fencing, retry/backoff/escalation, terminal verification, kill switch, dry-run, and managed recurring scheduler using T01–T04 | Failure-injection and concurrent-worker evidence; every resource has a verification check; safe default configuration |
| T06 | Implement Apple authorization capture/revocation, Google credential cleanup, RevenueCat privacy handling, subscription guidance, and transactional emails using verified contracts | Nonce repair preserved; legacy-provider policy; provider separation; delivery/outbox/retry evidence |
| T07 | Implement iOS/Android account entry, confirmation, pending state, startup/resume access guards, sync shutdown, receipt persistence, and namespace-safe terminal cleanup using T03–T04 | Consumer flows plus offline, interrupted, account-switch, reinstall, and terminal timestamp checks |
| T08 | Implement accessible web deletion, ownership verification, confirmation, pending, restore, and resend using the shared backend | `/delete-account` and `/account/restore` browser evidence; no app installation or second deletion engine |
| T09 | Integrate T03–T08; execute automated security, negative-control, mutation, isolation, provider, and UI coverage from the appendix; fix regressions | Source deliverables A–I, green exact-SHA CI for both repositories, explicit platform limitations |
| T10 | Verify Staging identity and fixture scope; deploy exact revisions with worker disabled/dry-run; migrate and exercise lifecycle | Deployment manifest and authenticated Staging request/deactivation/restore/purge/retry evidence |
| T11 | Certify scheduled Staging processing, kill switch, dry-run, alerts, expired lease recovery, full resource verification, and household isolation | Scheduler-generated run IDs/timestamps correlated with fixtures; alerts actually observed; Staging certification report |
| T12 | Prepare Production migration/deployment and rollback package; stop only gated Production work | Exact revisions, migration checksums/order, secret names only, scheduler configuration, target confirmation, test scope, emergency runbook, approval request |
| T13 | After explicit deployment/test authorization, deploy with destructive scheduling disabled and certify a controlled disposable account | Production-only evidence, runtime permissions/guards, actual cleanup checks, monitoring and rollback readiness |
| T14 | After separate worker activation approval, enable unattended processing and observe scheduled runs and monitoring | Production scheduler ACTIVE_CERTIFIED with real scheduler invocation evidence and approved end-to-end disposable-account evidence |

T06–T08 may proceed independently after their dependencies are stable. This is a dependency graph, not an instruction to spawn agents. Do not modify unapproved policy to unblock implementation. Continue safe source and test work while a specific product decision or external access remains pending.

## Critical implementation decisions to resolve explicitly

1. Define exact recovery-versus-purge arbitration in the database. At the deadline recovery is refused, and only eligible requests can be claimed. The winning transactional transition determines authority. Never rely on browser time or an application-only lock.
2. Distinguish restoration requested from access restored. Use a documented intermediate state or equivalent durable reconciliation record when Auth unban is outstanding. Reserve `restored` for the fully reconciled contract; retries must not permit worker claims or falsely report access recovery.
3. Treat database, Auth, email, storage, and providers as separate systems. Use durable operation records and reconciliation for cross-system work; do not claim a single SQL transaction rolls back external effects.
4. Fence stale workers at each destructive boundary. Document which external APIs lack fencing, serialize/idempotently reconcile those operations, and test an old worker resuming after lease expiry.
5. Define terminal verification independently from deletion calls. Zero unexpected owned resources, required Auth/storage checks, and documented lawful/provider retention are necessary before `purged` and its authoritative timestamp. An API attempt is not proof of erasure.
6. Keep receipt hashes and minimal pseudonymous terminal evidence only as needed by a documented retention policy. Device status must remain verifiable after Auth deletion without public account enumeration.
7. Implement completion email through a short-lived, access-restricted outbox or another reviewed strategy. Account for it in the resource registry and retention schedule; do not retain an address indefinitely in the terminal ledger.
8. Quarantine unresolved shared ownership cases for resolution while continuing safe cleanup. Escalate explicitly, prevent false terminal success, and preserve other customers' legitimate data.
9. External revocation failure must not indefinitely preserve Her Keys data. Bound retries, record unresolved provider work without unnecessary personal data, and document the provider-specific retention and terminal criteria.
10. Ensure web verification can establish sufficiently recent identity without normal app access, including pending-account restoration and supported authentication methods. Email input alone never authorizes deletion.

## Automated verification and repair loop

For each task: inspect the current contract, implement the smallest complete change, run targeted checks, inspect failures, fix root causes, and rerun affected checks. Run the repository-required integrated suite at integration gates. Capture actual commands, exit results, test counts, tested SHA, environment, and redacted evidence. Never invent commands before discovering repository tooling.

If a check fails repeatedly for the same external reason, record the precise blocker and reproduction, then continue unrelated tasks. Do not weaken security assertions, skip mandatory tests to make CI green, fabricate provider success, or loop indefinitely on unavailable infrastructure. Changes after certification invalidate affected evidence and require relevant retesting at the new revision.

Use synthetic two-account and shared-household fixtures. Accelerate expiry only through a fixture mechanism restricted to non-Production testing; prove ordinary users cannot change time or deadlines. Keep actual 30-day deadline arithmetic tests. A Production disposable test requiring controlled expiry must have separately approved, narrowly constrained mechanics; never add a public deadline bypass or wait 30 days without an agreed test strategy.

Scheduler certification must observe actual recurring invocations without manual dispatch. Record chosen frequency, maximum expected purge delay, run correlation, enabled status, authorization, batch/concurrency limits, retry policy, stale-lease thresholds, alert routing, and kill-switch latency. Choose values from verified infrastructure limits and document them before enabling. A cron definition alone cannot pass runtime certification.

Test the kill switch during active processing and document whether it prevents new claims, halts between resources, or waits for bounded in-flight operations. Dry-run must perform no destructive provider, Auth, storage, or database cleanup and must not set terminal success.

Validate secrets are absent from Git, client bundles, telemetry, URLs captured by analytics, and test evidence. Recovery pages must prevent token leakage through logs, referrers, third-party scripts, and link-scanner GET requests; consume the recovery token only through explicit confirmation with appropriate request protections.

## Completion, handoff, and reporting

Source, Staging, and Production are independent certification levels. A blocked Production gate does not stop authorized source/Staging work. At the end of the authorized scope, provide:

- Exact changes and artifact links, both repositories' ENTRY/EXIT SHAs, and exact-SHA CI links/results.
- The appendix's complete certification matrix, with evidence per result and all remaining blockers. For binary source gates, unavailable proof cannot count as PASS; state why it is FAIL. Use NOT_RUN only where the schema allows it.
- A Production approval package naming concrete revisions, target, migration/deployment actions, costs if material, disposable test scope, emergency controls, and expected effects.
- A separate activation package for unattended destructive scheduling after Production checks succeed.
- The next safe action and the specific approval/access needed for any gated work.

Do not claim public-release readiness until Production scheduling is ACTIVE_CERTIFIED, Production end-to-end checks pass, and all other mandatory gates have evidence. Do not execute EAS or publish a store build.

The rest of this file preserves the supplied requirements in full.

---

# REQUIREMENTS APPENDIX — ORIGINAL OWNER BRIEF

# HER KEYS — AUTOMATED ACCOUNT DELETION & RECOVERY
## Shared Mobile + Supabase + Website + Production Scheduler

**ROLE:** Senior Full-Stack Integration Engineer / Privacy Lifecycle Owner

**PROJECT:** Her Keys AI  
**REFERENCE ARCHITECTURE:** K Scan AI — Complete Account Deletion & Recovery Lifecycle  
**TARGET:** iOS, Android, Supabase, and herkeys.app  
**PRIORITY:** P1 — Required before public store release

## OWNER DIRECTIVE

Implement a complete, automated, 30-day recoverable account-deletion lifecycle modeled on K Scan AI.

Her Keys must support:

1. In-app account deletion requests.
2. Web-based account deletion requests.
3. Immediate account deactivation.
4. Secure restoration email.
5. A 30-day recovery period.
6. One-time account restoration.
7. Automated permanent deletion after expiration.
8. Complete account-owned data cleanup.
9. Terminal deletion verification.
10. Safe device-local cleanup.
11. Operational retries, alerting and emergency controls.

**Do not reproduce K Scan's unfinished Production scheduling state.**

The desired release result is a fully certified automatic deletion lifecycle, not an implemented worker that only runs manually.

Source implementation, Staging certification, and Production activation are separate approval gates.

---

# 1. SOURCE AUTHORITY AND WORKTREE PROTECTION

Mobile repository:

`herkeys/her-keys`

Website repository:

`herkeys/her-keys-web`

Relevant certified audit references:

Android:
`codex/build2b-android-candidate-audit`

Android SHA:
`308551bac7b609234dfe440a40bd1096720a08fe`

iOS:
`audit/ios-build2-candidate`

iOS SHA:
`925a9b445b75a3f34a7bd9a102167c65f6895f4b`

These are historical audit tips, not permission to overwrite either branch.

Begin by:

- Fetching both repositories.
- Identifying the current integration authority.
- Inspecting unmerged Android and iOS repairs.
- Creating an isolated deletion-lifecycle feature branch.
- Recording ENTRY SHAs and test baselines.
- Avoiding changes to active auditor worktrees.
- Preserving account, consent, synchronization and RevenueCat contracts.

No changes to canonical bundle IDs, Android package ID or EAS project identity.

---

# 2. REQUIRED CUSTOMER JOURNEY

## A. In-app deletion request

Create a persistent, discoverable entry:

**Your Account → Privacy & Data → Delete Account**

The option must remain available after onboarding.

The user must see:

- What information will be deleted.
- That account access stops immediately.
- That recovery is available for 30 days.
- What happens to Premium subscriptions.
- Whether any information is retained for legal or security reasons.
- A clear final confirmation.

Do not use a confusing or obstructive confirmation sequence.

Use a server-verified authenticated identity. Require appropriate recent reauthentication for sensitive requests, using a supported authentication method.

Do not trust an account ID submitted by the client.

A successful request must return a durable deletion receipt and deadline.

## B. Immediate deactivation

On successful confirmation:

- Create a server-owned deletion request.
- Record the server-side request time.
- Calculate `grace_period_ends_at = requested_at + 30 days`.
- Mark the account pending deletion.
- Prevent normal app access.
- Stop household synchronization.
- Restrict new authentication and token refresh where supported.
- Revoke active sessions where supported.
- Enforce account state on data-access boundaries.
- Send or queue the restoration email.
- Present a truthful pending-deletion screen.

**Important:** Supabase-issued JWTs may remain valid until expiration. A temporary Auth ban or client sign-out is not sufficient protection.

The database, privileged RPCs, Edge Functions, and synchronization paths must refuse pending-deletion accounts even if a previously issued JWT remains cryptographically valid.

Do not return successful deactivation unless authoritative server state is durably recorded and account access is effectively restricted.

An email-delivery failure must not silently reactivate the account.

---

# 3. DATABASE STATE MACHINE

Implement a server-owned deletion lifecycle.

Recommended states:

`deactivated`

`restored`

`eligible_for_purge`

`processing`

`retry_pending`

`failed_requires_action`

`purged`

Use exact transition rules and distinguish recoverable worker errors from permanent operator-action failures.

Create a durable deletion-request ledger with:

- Request ID.
- Account identifier while needed.
- Server request timestamp.
- Deactivation timestamp.
- Grace deadline.
- Lifecycle status.
- Restoration-token hash.
- Token expiry.
- Restoration timestamp.
- Processing lease and fencing information.
- Attempt count.
- Retry deadline.
- Failure category.
- Purge timestamp.
- Verification status.
- Minimal pseudonymous audit evidence.

Do not retain raw restoration tokens.

Avoid retaining identifiable account information in terminal audit records without a documented operational or legal need.

All lifecycle transitions must be transactional, authorized, idempotent and safe under concurrent requests.

A repeated deletion request must not restart the grace deadline.

---

# 4. ACCOUNT RESTORATION

Create a secure restoration flow using Her Keys' existing domain:

`https://herkeys.app/account/restore`

The customer receives an email containing a single-use, high-entropy recovery link.

The server must:

- Store only the token hash.
- Validate the token securely.
- Check the original deadline.
- Reject expired or already-used links.
- Prevent restoration once deletion has been claimed for irreversible processing.
- Mark restoration atomically.
- Invalidate all outstanding restoration tokens.
- Restore permitted account access.
- Clear the pending-deletion restriction.
- Prevent the purge worker from claiming the restored request.
- Send confirmation.
- Require a fresh normal sign-in.

If an Auth unban fails, return a pending-recovery state and safely retry. Do not report full restoration until access has actually been restored.

## Lost recovery email

Implement an email-based resend route.

Requirements:

- No account enumeration.
- Rate limiting.
- Abuse protection.
- Generic responses for unknown emails.
- Replacement links invalidate earlier links.
- Resending never extends the 30-day deadline.
- Recovery must remain accessible throughout the permitted grace period.

A short-lived link is acceptable if customers can request a new one before the grace deadline.

Do not place sensitive recovery tokens in analytics or application logs.

---

# 5. SUPABASE BACKEND IMPLEMENTATION

Her Keys Production:

`npykvnxnehlsdlbumzwk`

Her Keys Staging:

`fhhudicklmpofuzkxeqe`

Inspect the existing Build 4 schema, migrations, ownership contracts, RLS and service boundaries before proposing destructive operations.

Recommended Edge Function boundaries:

- `request-account-deletion`
- `restore-account`
- `resend-restoration-email`
- `deletion-status`
- `process-account-deletions`

Names may differ if existing architecture suggests a better convention, but the responsibilities must remain separated.

## Security requirements

- Admin secrets remain server-side.
- Request ownership comes from authenticated server verification.
- Public restoration endpoints require valid single-use tokens.
- Resend endpoints resist enumeration and abuse.
- Worker endpoints require internal service authorization.
- No customer can nominate another account for deletion.
- No arbitrary deletion by passing an account or household ID.
- All privileged SQL functions use constrained privileges and fixed search paths.
- No client-controlled GUC may authorize privileged deletion.
- Fail closed on ambiguous ownership or incomplete state.
- Preserve consent, household and private-record boundaries.

## Critical existing schema contract

The Build 4 schema includes protected append-only ledgers and a trusted server-context mechanism anticipating authorized account purges.

Inspect those protections carefully.

Do not disable immutable-ledger triggers globally or create a broad authenticated deletion bypass.

If privileged purge helpers are required, constrain them to the internal worker and prove they cannot be invoked by an ordinary authenticated user.

All migrations must be additive, reviewable, reversible where practical and fully tested in Staging before Production.

---

# 6. COMPLETE DATA-DELETION INVENTORY

**Do not assume deleting `auth.users` automatically deletes everything.**

Build an authoritative deletion-resource registry covering the actual current Her Keys schema.

Inspect and classify:

- Supabase Auth identities and sessions.
- User profile.
- Household ownership and membership.
- Household categories.
- Children and associated information.
- Tasks and schedules.
- Calendar events and imported calendar metadata.
- Systems and routines.
- Meals.
- Co-parenting records.
- Money and reimbursement records.
- Work and career information.
- Rebuild/private records.
- Life Admin documents.
- People and follow-ups.
- Talk It Out conversation and capture records.
- Discovery/AI information.
- Onboarding and Life Systems Audit results.
- Consent records.
- Sync change logs and cursors.
- Action and execution ledgers.
- Supabase Storage files and ownership.
- Google Calendar refresh tokens.
- Apple authentication credentials.
- RevenueCat-linked identity or entitlement mirrors.
- Welcome-email receipts.
- Other account-scoped records found through a full schema census.

For each resource identify:

- Exact table, storage bucket or provider.
- Account or household ownership key.
- Foreign-key behavior.
- Deletion order.
- Whether it is deleted, anonymized or lawfully retained.
- Whether it can be shared with another legitimate account.
- Verification query or API check.
- Retry behavior.

Do not claim deletion coverage based only on foreign-key cascades.

## Shared household protection

Her Keys may contain child, household, co-parenting and other relationship data.

Verify the actual ownership model.

Never delete another active customer's legitimate records simply because one member requests deletion.

Never transfer ownership or retain the departing customer's private information without an explicit product and privacy contract.

If ownership is ambiguous, isolate the case for resolution while continuing all safe account-owned cleanup.

Document any exceptional retention.

---

# 7. AUTOMATED PERMANENT DELETION WORKER

Implement a protected recurring worker that processes expired grace periods automatically.

Required properties:

- Database-controlled enable/disable switch.
- Dry-run mode.
- Strict deadline eligibility.
- Transactional request claiming.
- Database lease and fencing token.
- Concurrent-worker safety.
- Bounded batch size.
- Idempotent cleanup operations.
- Retryable failures.
- Backoff scheduling.
- Lease expiration recovery.
- Maximum attempts and operator escalation.
- Per-resource cleanup evidence.
- Permanent-deletion terminal verification.

Use an appropriate managed scheduler, such as a correctly secured Supabase scheduling mechanism or an approved scheduled GitHub Actions workflow.

A scheduler configured only for manual dispatch does **not** qualify as operational automation.

## Deployment gates

Phase A: Source implementation and tests.

Phase B: Staging deployment and simulated expired-grace processing.

Phase C: Staging recovery, worker and failure certification.

Phase D: Production configuration review and explicit owner approval.

Phase E: Controlled Production disposable-account end-to-end certification.

Phase F: Enable unattended Production scheduling with monitoring.

**Do not enable destructive Production processing as part of an unapproved code audit or feature-branch push.**

The owner must approve Production migration and worker activation separately.

The final release cannot pass until the Production scheduler is demonstrably active and working.

## Mandatory safeguards

- Kill switch.
- Separate dry-run switch.
- Worker scoped to eligible requests.
- No early deletion.
- No processing of restored requests.
- No deletion of another user's household.
- No false `purged` status.
- No silent permanent failure.
- Operational alerting for stale leases and unresolved failures.
- Clear documentation for stopping the scheduler safely.

---

# 8. APPLE SIGN-IN AND EXTERNAL SERVICES

## Apple Sign-In

Her Keys uses native Sign in with Apple on iOS.

The existing Apple provider returns an identity token but does not yet preserve the authorization material required for automated credential revocation.

Design and implement the appropriate secure Apple authorization/revocation contract.

Coordinate the work with the iOS audit's nonce-bound Apple authentication fix.

Do not break the repaired nonce flow.

Revoke Apple authorization as required by the deletion lifecycle, using Apple's supported server API where credentials are available.

Document and safely handle legacy accounts whose revocation material was not retained.

Never block permanent deletion of Her Keys account data indefinitely because an external provider's revocation fails.

## Google Calendar

Remove account-bound OAuth credentials and connection records.

Revoke provider access where supported, without modifying a customer's actual Google Calendar events.

## RevenueCat and Premium

Account deletion does not automatically guarantee cancellation of an Apple or Google store subscription.

Provide clear instructions and applicable store subscription-management links before deletion.

Reconcile Her Keys account access, RevenueCat identity, entitlements and deletion-state handling.

Prevent pending-deletion accounts from accessing Premium features.

Do not grant, transfer or cancel paid entitlements for another user.

Do not assume removing a Supabase account erases RevenueCat's provider-side records.

Document the relevant RevenueCat privacy/deletion API and any provider retention obligations.

---

# 9. EMAIL INTEGRATION

Use Her Keys' configured transactional email infrastructure, including verified sender-domain configuration.

Implement:

1. Deletion requested / account deactivated.
2. Restoration email with secure single-use link.
3. Replacement restoration link.
4. Account successfully restored.
5. Permanent deletion completed, using a supported delivery strategy that does not retain an unnecessary email address in the terminal ledger.
6. Processing problem requiring customer action, where applicable.

Emails must be readable on mobile, clearly branded and accurate about the deadline.

A failed email provider response must be visible to operational monitoring.

Never claim an email was delivered merely because an API request was attempted.

Provide resend and fallback support paths without account enumeration.

---

# 10. WEBSITE IMPLEMENTATION

Repository:

`herkeys/her-keys-web`

Existing public resource:

`/delete-account`

Convert this disabled placeholder into a functional deletion resource.

The public page must allow a customer without the installed app to begin an account deletion request.

Use email verification or an appropriate secure authentication flow to establish ownership.

Do not accept an email address alone as sufficient authorization to deactivate or delete an account.

Do not require reinstallation of the mobile app.

Implement:

- Public deletion request entry.
- Identity verification.
- Confirm deletion.
- Pending-deletion acknowledgment.
- Restoration/resend flow.
- Explanation of the 30-day deadline.
- Subscription cancellation guidance.
- Retention disclosures.
- Accurate status/error messaging.
- Mobile-responsive accessibility.

Never expose account-existence information to unauthenticated callers.

Reuse the same backend deletion state machine as the mobile app.

Do not create a second independent deletion engine in Next.js.

Preserve the permanent public URL so Google Play can reference it.

Update website privacy/support navigation appropriately.

---

# 11. MOBILE INTERFACE

Create or extend persistent account-management screens on both Android and iOS.

Required experience:

**Your Account**
- Account details.
- Premium/Restore Purchases where separately implemented.
- Privacy & Data.
- Delete Account.

**Delete Account**
- Clear explanation.
- Grace-period deadline.
- Subscription information.
- Confirmation action.
- Pending-deletion result.

**Deletion Pending**
- Normal app use unavailable.
- Explicit status.
- Instructions for restoring by email.
- Recovery information.
- Clear distinction between pending and permanently deleted.

The app must not simply return the user to Today after a successful deactivation.

## Device-local data

Her Keys uses local household persistence and secure session storage.

Implement a safe terminal cleanup mechanism.

During the recovery window:

- Block normal access to deactivated account data.
- Stop sync and account-bound services.
- Prevent accidental writes to a deactivated account.
- Protect locally cached household information.
- Do not incorrectly erase recoverable data.

When deletion reaches terminal `purged` status:

- Validate an authenticated or opaque receipt-bound server status.
- Require both a terminal status and authoritative purge timestamp.
- Clear the deleted account's local household namespace.
- Clear relevant local credentials and sync state.
- Reset provider identity safely.
- Return the app to a fresh-install state.

A network error, expired token or temporarily unavailable deletion-status service must never be interpreted as proof of permanent erasure.

A reinstall, offline phone or backgrounded app must not silently reconnect a deactivated account and resume synchronization.

Do not erase a different user's local household.

---

# 12. DELETION STATUS ENDPOINT

Implement a read-only status mechanism for a device that has already lost its normal authenticated session.

Use an opaque high-entropy receipt or equivalent secure proof.

Never expose another user's deletion status through predictable identifiers or email addresses.

Supported responses:

`pending`

`restored`

`failed`

`purged`

Only `purged` with a verified timestamp may authorize terminal local cleanup.

Status polling must not trigger or accelerate deletion.

---

# 13. COMPREHENSIVE AUTOMATED TESTING

Create and execute tests covering:

## Request and deactivation
- Legitimate owner request.
- Unauthenticated request rejected.
- Wrong-account request rejected.
- Duplicate request idempotence.
- Correct 30-day deadline.
- Deactivation failure rollback.
- Normal access refused after deactivation.
- Previously issued token refused at protected service boundaries.

## Restoration
- Valid one-time token.
- Expired token.
- Replayed token.
- Replaced token.
- Recovery at grace-window boundary.
- Recovery during worker competition.
- Resend rate limiting.
- No email enumeration.
- Unban failure.
- Proper return to authenticated state.

## Worker
- No deletion before deadline.
- No deletion of restored accounts.
- Concurrent worker attempts.
- Lease expiration.
- Crash and retry.
- Storage cleanup failure.
- External provider failure.
- Interrupted Auth deletion.
- Reconciliation after partial completion.
- Correct terminal verification.
- Complete pseudonymous audit trail.

## Data isolation
- Two distinct accounts.
- Multiple household members where supported.
- Child data.
- Private Co-Parenting records.
- Shared references.
- Different-device local data.
- RevenueCat account separation.
- Legacy account with missing Apple revocation material.

## Platform/UI
- Android deletion flow.
- iOS deletion flow.
- Apple-authenticated account.
- Google-authenticated account.
- Email/password account.
- Website deletion without mobile app.
- Pending-deletion display.
- Recovery link.
- Final local cleanup.
- Offline and interrupted flows.

Add negative controls and mutation tests for the critical authority and lifecycle guards.

No test may claim Production execution when only Staging or local fixtures were used.

---

# 14. ENVIRONMENT AND PRODUCTION SAFETY

**Allowed immediately:**
- Isolated source changes.
- Additive migrations in source.
- New Edge Function source.
- Website source.
- Mobile UI source.
- Tests.
- Documentation.
- Reviewable commits.
- Exact-SHA CI.

**Deployment control:**
- Staging migration/deployment requires verified project identity and safe test scope.
- Production migration/deployment requires explicit owner approval.
- Production worker enablement requires separate explicit owner approval.
- No real Production account may be deleted as a test.
- No unrelated project may be touched.
- No service-role credential may enter the mobile app or website client bundle.

Do not copy K Scan credentials, database IDs, customer records, deletion tables or live endpoint references into Her Keys.

Reuse architecture, not operational secrets or historical backlog.

---

# 15. REQUIRED DELIVERABLES

Produce:

**A. Architecture document**

Actual Her Keys deletion dataflow, ownership model and state machine.

**B. Deletion resource registry**

Every account-owned database, Storage and external-service resource, with exact cleanup and verification behavior.

**C. Backend implementation**

Reviewed SQL migrations, functions, worker, access controls, scheduler configuration, tests and safety flags.

**D. Mobile implementation**

Functional iOS/Android deletion entry, confirmation, pending status and terminal device cleanup.

**E. Website implementation**

Working `/delete-account` request and `/account/restore` experience.

**F. Email implementation**

Templates, function integration, once-only behavior and delivery evidence.

**G. Security report**

JWT validity after deactivation, RLS, RPCs, token hashing, privacy retention, OAuth revocation and worker authority.

**H. Automation certification**

Scheduler, frequency, kill switch, dry-run, retries, alerts, lease handling and permanent deletion verification.

**I. Release evidence**

ENTRY/EXIT SHA, changes, test counts, exact-SHA CI, Staging test results, deployment status and residual blockers.

---

# 16. FINAL CERTIFICATION GATES

Return explicit evidence-backed results:

`DELETION_BACKEND_SOURCE=PASS|FAIL`

`DELETION_DATA_COVERAGE=PASS|FAIL`

`DELETION_IMMEDIATE_DEACTIVATION=PASS|FAIL|NOT_RUN`

`DELETION_30_DAY_RECOVERY=PASS|FAIL|NOT_RUN`

`DELETION_RECOVERY_EMAIL=PASS|FAIL|NOT_RUN`

`DELETION_WEB_REQUEST_FLOW=PASS|FAIL|NOT_RUN`

`DELETION_IOS_CONSUMER_FLOW=PASS|FAIL|NOT_RUN`

`DELETION_ANDROID_CONSUMER_FLOW=PASS|FAIL|NOT_RUN`

`DELETION_APPLE_REVOCATION=PASS|FAIL|NOT_RUN`

`DELETION_EXTERNAL_CREDENTIAL_CLEANUP=PASS|FAIL|NOT_RUN`

`DELETION_WORKER_IDEMPOTENCY=PASS|FAIL`

`DELETION_TERMINAL_VERIFICATION=PASS|FAIL|NOT_RUN`

`DELETION_STAGING_E2E=PASS|FAIL|NOT_RUN`

`DELETION_PRODUCTION_SCHEDULER=ACTIVE_CERTIFIED|DISABLED|NOT_DEPLOYED`

`DELETION_PRODUCTION_E2E=PASS|FAIL|NOT_RUN`

`DELETION_STORE_REQUIREMENTS=PASS|FAIL`

Do not collapse these into one premature PASS.

## Completion standard

Source completion requires functional app/web paths, backend implementation, automated tests and green exact-SHA CI.

Staging certification requires an authenticated request, deactivation, restoration, accelerated eligible-purge fixture, complete cleanup, verification and worker-retry testing.

Production certification requires separately authorized deployment, controlled disposable-account verification, functioning unattended scheduling, alerts and documented emergency controls.

**The final public-release gate cannot pass while Production automated deletion is disabled, untested or manual-only.**

---

# FINAL DIRECTIVE

Build Her Keys' complete 30-day automated account deletion and recovery lifecycle using K Scan AI as the architectural reference.

Preserve the existing Her Keys security model, account ownership, consent requirements, synchronization isolation, and iOS/Android platform differences.

Deliver actual consumer-facing functionality, not backend-only modules.

Use the existing website deletion URL.

Keep the worker safe until separately approved for Production activation.

Complete the source implementation and Staging certification, then return a precise Production activation handoff.

**Do not run EAS or publish a store build under this assignment.**
