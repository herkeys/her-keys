# Architecture and trust boundaries

Mobile authority: codex/build2b-shared-integration at ad72ccd5b517a83bde5e7bbf3bf658193a667b82. origin/main is an older Build 3 snapshot without the integrated account backend. Website entry: b893909. The iOS nonce repair 3fc9a46 was cherry-picked as 824b258; active audit worktrees were untouched.

A verified user bearer and recent auth.sessions.created_at authorize the service-only request command. The client supplies only a high-entropy device receipt. Account/email IDs in a client body cannot select the victim. The SQL transaction records the exact original 30-day deadline, hashed recovery and receipt proofs, restrictive access state, and encrypted recovery-email outbox. Repeated requests retain the deadline and can register another device proof.

RLS restrictive policies AND the original ownership policies. Existing authenticated privileged bootstrap/claim/sync RPCs receive an explicit account-active guard. Edge requireUser checks authoritative account state by default; only the lifecycle request opts into pending identity access. OAuth callbacks check state, with provider-write triggers closing their check/write race. Old JWT signatures alone do not authorize access.

State transitions:

| From | To | Actor and condition |
| --- | --- | --- |
| No open request | deactivated | Verified identity and session authenticated within 10 minutes; transaction records restriction/outbox |
| deactivated | restoring | Matching unused recovery hash; DB clock strictly before original deadline; row lock wins over claim |
| restoring | restored | Deactivation side effects acknowledged, Auth unban succeeds, transactional confirmation queued |
| deactivated / retry_pending / partial_purge_pending_review | processing | Enabled, non-dry-run worker; DB deadline reached; row claim with SKIP LOCKED, incremented fence and five-minute lease |
| processing expired lease | processing | Eligible worker reclaims with a new fence; old worker is refused |
| processing | retry_pending | Retryable resource failure and attempts remain; bounded exponential backoff |
| processing | partial_purge_pending_review | Shared cases remain and independent provider/private cleanup still needs bounded retries; public status explicitly reports review required |
| processing | failed_requires_action | Attempt ceiling, shared ownership, unknown resource, or permanent operational failure |
| failed_requires_action / partial_purge_pending_review | retry_pending | Service-only reviewed requeue; all exact cases resolved after their resources were reconciled; no automatic ownership transfer |
| processing | purged | Database cleanup evidence, provider/storage/Auth evidence, Auth/profile/blob absence, and authoritative timestamps; account UUID removed |

There is no need to persist a separate eligible_for_purge state: eligibility is the strict server deadline predicate. Public receipt status maps internal processing/restoring/retry states to pending, never purged. Polling has no destructive side effect.

Database, Auth, Storage, Resend, Apple, Google and RevenueCat are separate systems. The database transaction cannot roll them back together. A durable outbox, resource evidence, leases, fencing, and reconciliation make partial work inspectable. Raw recovery tokens exist only in memory and encrypted outbox payloads, never in the ledger, logs, analytics, or query strings.

The scheduler blueprint installs a disabled five-minute pg_cron job. It invokes the internal worker with a 60-second HMAC proof; the signing secret remains in a private table and never enters the pg_net request queue. The worker verifies proof through a service-only RPC. Production installation and activation remain separate explicit approval gates.

On devices, a secure receipt is persisted before the network request. The lifecycle gate stops sync and canonical writes while restricted and checks access at startup/foreground. Network errors cannot prove erasure. Terminal cleanup requires unexpired purged proof, valid authoritative timestamps and a receipt already bound to the current local account namespace. Restoration requires fresh sign-in. A pending web receipt can be imported only after matching its nonterminal account fingerprint; late terminal imports are refused. Expired/unavailable proof never erases data. An explicit DELETE LOCAL DATA confirmation and repeated namespace checks provide a user-initiated local reset.

The approved shared-household policy deletes private leaves independently, restricts exact ambiguous resources and opens seven-day operator cases. It prohibits automatic transfer and false terminal success. Provider failures continue independent local cleanup; revocation material is destroyed at the bounded attempt ceiling, and unresolved external work remains failed_requires_action. Legacy Apple identities without revocation material cannot pass provider verification.

The approved 365-day terminal policy uses a separate five-column minimal proof table. Verified purge removes the identity-bearing request and cancelled history, receipt associations and cases. A separate encrypted completion outbox is unlinked and expires within seven days. Daily retention cleanup, failure/stale/backlog monitoring and unavailable-proof semantics are described in retention-policy.md.

Known incomplete contracts: native runtime certification, complete hosted resource-fixture/failure coverage and operational review. These prevent release certification. Delivery monitoring polls Resend acceptance records separately from actual delivery and alerts on operational failures with a separately scheduled endpoint. Production worker activation remains gated. Live Apple/Google tests are deferred by the owner and remain unverified; public support is configured in website source. Eight reviewed Production SQL migrations were later authorized and applied; see owner-decisions.md.

Ownership classification locks the relevant household parents in deterministic order until database cleanup commits. New membership/content inserts must finish before classification or wait for cleanup; another adult cannot be introduced between the ownership check and the whole-household delete. The check also recognizes private ownership retained after membership removal.
