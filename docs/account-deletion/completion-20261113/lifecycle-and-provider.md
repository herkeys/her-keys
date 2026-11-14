# Lifecycle, resource ownership and provider proof

The request row and server clock remain authoritative. There is one current lifecycle per account. Active is the absence of a restricting request; a restored lifecycle is history. Eligibility is derived from original deadline plus lease/retry conditions, not a stored status.

| Value | Transition and authority |
|---|---|
| No active request | Recent authenticated owner may request. Verified JWT/account and session are tied to the server-generated deadline and private receipt. |
| `deactivated` | Restricts normal data operations. A live recovery proof can reserve restoration before the deadline. After the deadline only a current enabled, non-dry-run worker can claim it. |
| `restoring` | Restore reserved, proof consumed. A short Auth reconciliation lease prevents parallel unbans. Verify unban and finalize before reporting restored. |
| `restored` | Access restored; owner signs in again. A later deletion request starts a fresh lifecycle. |
| `processing` | Worker is fenced; lease expiry permits a new fence. |
| `retry_pending` | Worker may claim after retry time, with a new fence. |
| `partial_purge_pending_review` | Shared ownership or incomplete cleanup; surfaced as failed/review. Reviewed resolution can requeue. |
| `failed_requires_action` | Operator must review and safely requeue or resolve. Never implies completion. |
| `purged` | Public terminal status follows the independent resource verification and minimal, unexpired receipt proof. The implementation deletes the identity-bearing lifecycle row upon finalization. |

The 365-day proof contains only receipt hash, purge and verification time, aggregate counts and expiry. Completion mail is separate. The client preserves device data until authoritative proof and scopes cleanup by account. No UI code was changed in the app in this pass. Native Android, iPhone and iPad verification must exercise account switching, restart and unavailable status, plus local storage, notification and receipt isolation. An offline device may never observe the terminal proof.

| System | Erasure/verification scope | This checkpoint |
|---|---|---|
| Supabase | Independent owner counts across database, Storage and Auth absence; storage blobs removed via Storage API. Preserve other adults and escalate shared ownership. | Local SQL and resource isolation regressions pass; hosted NOT RUN. Exact table map in baseline evidence. |
| Apple | Revoke known usable credentials. The merged fallback for legacy accounts requires separate policy sign-off and does not claim revoked. | Local provider outcomes tested; live revocation owner-deferred. |
| Google | Revoke Her Keys Calendar grant, preserve calendar events and Google identity; explicit invalid-token response has separate settlement. | Local provider outcomes tested; live revocation owner-deferred. |
| RevenueCat | Customer removal must be followed by authoritative absence; separately preserve store subscription and validate Restore Purchases. | Local response tests and prior Staging evidence only. Live store reconciliation and re-purchase cases remain open. |
| Gemini | Clear Her Keys-owned records through the registry. | Vendor log retention or erasure NOT VERIFIED. |
| Resend | Bounded encrypted mail queue and provider delivery status. | Delivery code checked locally; inbox evidence and processor retention NOT VERIFIED. |

Unresolved Apple/Google credentials are retained under existing restricted storage for operator retry, rather than treating an empty credential lookup after retry exhaustion as settled. Security/Legal must approve a bounded escalation/retention policy before rollout. Existing fencing, shared-case handling and terminal proof requirements remain in force.
