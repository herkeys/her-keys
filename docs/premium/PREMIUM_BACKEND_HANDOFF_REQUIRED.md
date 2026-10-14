# Premium backend handoff required — Pass A

Date: 2026-10-14. Integration source: `1a0d25e25b8ac0587b448eda392c7a12e6c682c0`; Premium source: `e4462d2a5cb42706a8523f6ba45248ee9396d02e`; deletion source: `4aefa5f20adc38fc867e5a354f1faf279fab65a0`.

Status: **BLOCKED** pending backend-owner answers and Staging verification. This document proposes callable contracts for owner review; none of the Village or Co-Parent signatures below exists or has been agreed by the backend. It creates no UI, route, mock, migration, feature configuration or client state. Existing Free co-parent logistics are a separate feature.

Producer/environment: source inspection of `docs/premium/PREMIUM_VILLAGE_AND_COPARENT_PLUS_CONTRACTS.md`, the two Premium migrations, `supabase/functions/_shared/premium/*`, and `git show origin/codex/account-deletion:docs/account-deletion/resource-registry.md`; local. Hosted evidence below is required acceptance evidence, **NOT RUN in this pass**.

## Common typed wire contract (proposed)

```typescript
type UUID = string; // canonical UUID, validated server-side
type Instant = string; // ISO-8601 UTC, emitted by server
type Day = string; // YYYY-MM-DD, with an explicit IANA zone for schedules
type Request<T> = { idempotencyKey: string; expectedVersion?: number; input: T };
type Reply<T> = { ok: true; data: T; operationId: UUID; version: number }
  | { ok: false; error: { code: ErrorCode; retryable: boolean }; operationId?: UUID };
type ErrorCode = 'unauthenticated' | 'account_deactivated' | 'ownership_denied'
  | 'feature_disabled' | 'service_unavailable' | 'requires_premium'
  | 'entitlement_unknown' | 'entitlement_expired' | 'requires_ai_consent'
  | 'quota_exhausted' | 'rate_limited' | 'invalid_input' | 'not_found'
  | 'invite_expired' | 'invite_consumed' | 'relationship_revoked'
  | 'blocked_participant' | 'version_conflict' | 'illegal_transition'
  | 'idempotency_conflict' | 'attachment_unavailable';
```

JWT supplies the actor; input never accepts authoritative owner, actor, entitlement or household membership fields. Unknown keys are rejected. UUIDs must resolve within the caller's permitted scope. No response or error reveals private records or whether an unshared identifier exists. HTTP 401 for authentication, 403 for forbidden work, 404 for inaccessible records, 409 for replay/version conflicts, 410 for consumed/expired invitation, 422 for invalid input/transition, 429 for quota/rate, and 503 for readiness failures are proposed; backend must approve the exact mapping and callable RPC names.

Every mutation stores `(actor, operation, idempotencyKey, payloadDigest)` and its receipt atomically. Same key/body returns the original result; different body returns `idempotency_conflict`; simultaneous submissions execute once. Client response loss must be recoverable by an owner-readable receipt. Server authorization precedes creation; existing shared participation and saved-record reads remain available to Free/expired subscribers. Membership in a private household is never created by invitation acceptance.

## Village — missing artifacts

Proposed tables: `village_invitations(id, host_account_id, household_id, token_hash, expires_at, accepted_account_id, accepted_at, revoked_at, version)`; `village_assignments(id, invitation_id, host_account_id, participant_account_id, private_task_ref, shared_snapshot, status, acknowledged_at, confirmed_by_host_at, version)`; `village_transitions(id, assignment_id, actor_account_id, action, server_at, version)`; `village_blocks(blocker_account_id, blocked_account_id)`; `village_reports(id, reporter_account_id, invitation_id, reason_code, server_at)`. Backend must choose final names and validate bounded field sizes.

```typescript
type VillageShare = { title: string; when?: Instant; where?: string; note?: string };
type VillageState = 'offered' | 'accepted' | 'declined' | 'completed' | 'released' | 'expired' | 'revoked';
type VillageAction = 'acknowledge' | 'accept' | 'decline' | 'complete' | 'release' | 'confirm' | 'revoke';
// Proposed authenticated RPCs:
// village_invite(Request<{ householdId: UUID; taskId: UUID; share: VillageShare; helperLabel: string }>)
//   -> Reply<{ invitationId: UUID; token: string; expiresAt: Instant }>
// village_accept_invite(Request<{ token: string }>) -> Reply<{ assignmentId: UUID; status: VillageState }>
// village_assignment_transition(Request<{ assignmentId: UUID; action: VillageAction }>)
//   -> Reply<{ assignmentId: UUID; status: VillageState; acknowledgedAt?: Instant; confirmedAt?: Instant }>
// village_assignments_list({ cursor?: string }) -> Reply<{ items: VillageShare[]; nextCursor?: string }>
// village_block(Request<{ invitationId: UUID }>) -> Reply<{ blocked: true }>
// village_report(Request<{ invitationId: UUID; reason: 'abuse' | 'unwanted' | 'unsafe' }>) -> Reply<{ recorded: true }>
```

RLS: host owns invitation/assignment management; helper reads only a non-revoked assignment whose `participant_account_id=auth.uid()`. Helper projection omits household ID and the private task reference. No participant joins or dereferences tasks, children, notes, events, finances or membership tables. Direct writes denied; functions check role on every transition. Token is random, stored as SHA-256 only, expires in 14 days and binds to one authenticated helper on first use. No email/phone discovery or contact directory. Backend must settle how a host bounds the intended recipient without contact discovery, and how wrong-account acceptance is refused; bearer possession alone must not be presented as verified intended identity.

Replay: invitation acceptance cannot bind a second identity; retry by the accepted identity is idempotent. `completed` is a helper claim; host confirmation is a separate event. Revocation immediately denies further reads and invalidates cached-download permissions. New-invite cap 10 pending/household and 3/hour, no reminders before acceptance, at most 3 reminders with mute; notification owner approval remains required.

Deletion: host deletion withdraws/removes their copies and purges helper access; helper deletion anonymizes participant events and releases open assignments. No ownership transfer or deletion of unrelated users. Backend and deletion owners must resolve the contract's tension between retained transition evidence and removal of subject identifiers. Only host-confirmed completion may feed future Momentum delegation evidence.

Acceptance: real separate Free helper can accept/decline/acknowledge/complete; host confirms/revokes; wrong task/household/actor and forged ownership are denied; expired/reused tokens fail; blocked helper/report path works; multiple invites remain isolated; revocation while viewing clears data; subscriber expiration preserves permitted existing participation; both deletion paths are tested with row proof and actual JWTs. Keep `village_delegation.released=false` throughout Pass A.

## Co-Parent Plus — missing artifacts

Proposed tables: `coparent_relationships(id, inviter_account_id, counterpart_account_id, status, version)`; `coparent_invitations(id, token_hash, expires_at, accepted_account_id, relationship_id)`; `coparent_shares(id, relationship_id, sender_account_id, recipient_account_id, record_kind, snapshot, shared_children, version, shared_at, revoked_at)`; `coparent_schedule_versions(id, relationship_id, prior_version, zone, periods, exceptions, status, proposed_by, agreed_by, server_at)`; `coparent_expenses(id, share_id, currency, amount_minor, payer, allocation, owed_minor)`; `coparent_reimbursements(id, expense_id, requester, responder, status, version)`; append-only `coparent_events`; private `coparent_receipts` Storage bucket and attachment metadata; bounded export Edge Function. These artifacts are absent; backend must approve schemas, category allow-list, storage size/TTL, scanning provider and retention.

```typescript
type ParentAllocation = { parent: UUID; basisPoints: number } | { parent: UUID; amountMinor: number };
type CustodyPeriod = { start: Instant; end: Instant; parent: UUID | null; sharedChildRefs: UUID[]; source: 'rule' | 'manual' };
type ReimbursementState = 'requested' | 'acknowledged' | 'accepted' | 'disputed' | 'withdrawn' | 'paid_confirmed';
// coparent_invite(Request<{ label: string }>) -> Reply<{ token: string; expiresAt: Instant }>
// coparent_accept_invite(Request<{ token: string }>) -> Reply<{ relationshipId: UUID }>
// coparent_share(Request<{ relationshipId: UUID; kind: 'schedule' | 'expense' | 'note'; snapshot: unknown; sharedChildRefs: UUID[] }>)
//   -> Reply<{ shareId: UUID; sharedAt: Instant }>; snapshot must be replaced by closed per-kind schemas
// coparent_schedule_propose(Request<{ relationshipId: UUID; zone: string; periods: CustodyPeriod[]; exceptions: unknown[] }>)
//   -> Reply<{ scheduleVersionId: UUID; status: 'proposed' }>; exceptions need a closed swap/holiday/make-up union
// coparent_schedule_acknowledge(Request<{ scheduleVersionId: UUID; action: 'acknowledge' | 'agree' | 'dispute' }>) -> Reply<{ status: string }>
// coparent_expense_create(Request<{ relationshipId: UUID; currency: string; amountMinor: number; payer: UUID; date: Day;
//   category: string; sharedChildRefs: UUID[]; allocation: ParentAllocation[] }>) -> Reply<{ expenseId: UUID; owedMinor: number }>
// coparent_reimbursement_request(Request<{ expenseId: UUID }>) -> Reply<{ requestId: UUID; status: ReimbursementState }>
// coparent_reimbursement_transition(Request<{ requestId: UUID; action: 'acknowledge' | 'accept' | 'dispute' | 'withdraw' | 'resolve' | 'confirm_paid'; reasonCode?: string }>)
//   -> Reply<{ status: ReimbursementState; confirmations: UUID[] }>
// coparent_revoke(Request<{ relationshipId: UUID }>) -> Reply<{ revoked: true }>
// coparent_chronology({ relationshipId: UUID; cursor?: string }) -> Reply<{ events: unknown[]; nextCursor?: string }>
// coparent-export POST { relationshipId: UUID; format: 'csv' | 'pdf'; idempotencyKey: string }
//   -> Reply<{ downloadUrl: string; expiresAt: Instant }>
```

Backend must provide closed DTOs for snapshots, exceptions, chronology and statuses before client implementation; `unknown` placeholders in this handoff explicitly identify missing schemas, not acceptable final wire types. Include actor-specific acknowledgment and agreement timestamps, supersession and a stable pagination order `(server_at,id)`. Record edits append a version; `expectedVersion` CAS detects simultaneous edits.

RLS: only the two named accounts in an active relationship may read explicitly shared snapshots; never join to sender household/private notes/private finances/unshared children or another relationship. No household membership is granted. Private references remain sender-only. Reads and Free responder acknowledgment/accept/dispute/payment confirmation/export of already-shared records are independent of Premium. New creator work requires server authorization. Revocation denies further reads and invalidates attachment/export access; audit proof must not expose content to revoked users.

Money: integer minor units, closed supported currencies/categories, no floating amounts; one allocation mode/request; basis points sum 10000 or fixed minor units sum total. Largest remainder distributes rounding, tie by stable parent input order. Both confirmations are required for `paid_confirmed`; unilateral claims remain unconfirmed. Requests cannot jump states, auto-resolve disputes or move money.

Attachments: per-share private authorization, image/PDF allow-list, reviewed size cap, EXIF removal, scanning approval, short-lived URL and deletion tests. Export enumerates only authorized shares and includes version/acknowledgment chronology and the exact disclaimer in the approved contract (§2.7); never certified legal evidence.

Deletion: sender-private originals deleted; received copies may survive with former-account labeling and acknowledged-text rules only after OD-P1-10 approval. Pending proposals/requests withdrawn; receipts deleted per approved two-party rule; unrelated adult/household preserved; no ownership transfer. Backend must resolve revocation-versus-retained-copy semantics explicitly before Pass B.

Acceptance: real two-account isolation across private notes/finances/unshared child IDs, forged share/relationship/actor IDs, modified owner fields, concurrent schedule versions, every illegal reimbursement edge, rounding properties, bilateral paid confirmation, malicious receipt URLs, export scope/expiry, relationship revocation, two-adult deletion and Free responder after subscriber expiry. Keep `coparent_plus.released=false` throughout Pass A.

## Hosted Premium readiness — existing artifacts, missing configuration/evidence

Existing: `premium-gate`, `premium-reconcile`, `smart-inbox-extract`, `revenuecat-webhook`, `premium-ops`; two migrations; eleven Premium base tables. Do not redeploy as a substitute for the owner finishing configuration.

Missing secret/configuration artifacts: Staging Edge `PREMIUM_ENVIRONMENT=staging`, dedicated webhook Authorization and HMAC secrets, RevenueCat secret API key, operator secret, authorized Sandbox webhook, two authorized Staging Auth sessions, native platform offerings/products and verified restore policy. `GEMINI_API_KEY` and model identifier require spend authorization; no live evaluation is authorized by this task. Never paste secrets or tokens in issues/reports. The database environment does not set `Deno.env`.

Existing callable signatures/error shapes remain governed by `src/monetization/premiumTypes.ts`, `premiumServerClient.ts`, `premiumLedgerClient.ts`, A0 §5 and `supabase/functions/_shared/premium/*`. Preserve those contracts rather than silently making a second API. JWT supplies account; `premium_authorize` checks lifecycle/ownership/readiness/entitlement/consent/quota; account-ID or `isPremium` input cannot grant access. Owner-only saved decision reads remain subscription-independent. Usage replay must not double charge; provider failure releases reservations; late response/reconciliation cannot grant a different account.

Acceptance: configured missing/bad Authorization, HMAC/timestamp and JWT tests; zero projection on unauthenticated/foreign/anonymous calls; real Sandbox purchase, restore-under-B, TRANSFER reconciliation, delayed/out-of-order/replay, canceled-paid/grace/expired/revoked projection; actual quota race and rollback; lifecycle overlay; feature/global kill switches; schema-valid/invalid/timeout provider; replay after lost response. Every result needs HTTP status, persisted query/row IDs and exact deployed source. No fabricated entitlement. Live Gemini accuracy stays NOT RUN until separately authorized and measured. Backend answers issue with readiness confirmation before Checkpoint 6.

## Deletion/privacy — existing owner issue, no duplicate

Owner: deletion lifecycle owner. Existing [issue #9](https://github.com/herkeys/her-keys/issues/9). Registry/worker/SQL not edited by this integration pass.

Required artifacts: classified ownership for `premium_entitlements`, `premium_subscriber_identities`, `premium_reconcile_state`, `premium_usage`, `premium_usage_events`, `premium_authorization_audit`, `premium_decisions`; targeted `premium_events` scrubbing and terminal verification for `app_user_id`, `original_app_user_id`, `aliases`, `transferred_from`, `transferred_to`, `payload`; global runtime/feature/global-usage exclusions. Null account FK is insufficient anonymization.

Contract: pending deletion denies new Premium immediately; restore clears client hints and reconciles before activation; permanent purge verifies zero per-account/provider identifiers without touching other subscribers or shared global configuration. Repeated purge/partial provider failure remains idempotent and cannot issue false terminal proof. Concurrent webhook/reconcile cannot re-grant or recreate deleted identity. Retained minimal evidence must meet approved policy; no content/token/provider subject identifiers in terminal proof. Acceptance includes a TRANSFER/alias event involving A and B, A's purge, B's evidence preserved, zero A identifiers, restore-before-deadline, unrelated adult preserved, retries/concurrency and deletion-owner sign-off at an exact SHA with hosted proof.

## Issue links and response status

| Artifact group | Issue | Owner role / assignment | Response |
|---|---|---|---|
| Village / Co-Parent schemas, RPCs, RLS, hosted readiness | [#11](https://github.com/herkeys/her-keys/issues/11) | Premium backend owner; repository maintainer herkeys routes to agent | unanswered; BLOCKED |
| Native catalog, restore policy, auth read-back and device prerequisites | [#12](https://github.com/herkeys/her-keys/issues/12) | platform / RevenueCat / auth owners; herkeys | unanswered; BLOCKED |
| Premium provider identifier erasure / terminal verification | [existing #9](https://github.com/herkeys/her-keys/issues/9) | deletion lifecycle owner; herkeys | unanswered; BLOCKED |
| Client convergence / Expo / missing original management review | [#10](https://github.com/herkeys/her-keys/issues/10) | current integration agent; herkeys | Checkpoint 1 owner confirmation pending |

Producer/environment: connected GitHub Her Keys create_issue/add_issue_assignees/add_issue_labels, then `gh issue list --repo herkeys/her-keys --state open --limit 20 --json number,title,url,assignees,labels`; GitHub metadata retrieved locally. Snapshot: `docs/audits/v2-premium-pass-a-checkpoint1/handoff-issues.json`. Assigning the repository maintainer is routing to the named owner role, not an owner response; distinct agent GitHub usernames are unknown. Pass B remains unauthorized even after a response.
