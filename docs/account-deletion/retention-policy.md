# Approved terminal-proof retention

Owner approval: `TERMINAL_PROOF_RETENTION_DAYS=365`, measured from verified permanent purge. This applies only to verified terminal proof, never to incomplete cleanup or unresolved shared ownership. The seven-day manual-resolution target is unchanged.

The terminal table has exactly five columns: `receipt_hash`, `purged_at`, `verified_at`, `resource_counts`, `expires_at`. The receipt originates from 32 independent cryptographically random bytes; it is not derived from an email, account UUID or household identifier. The table contains no account fingerprint, original account/household ID, provider ID, recovery token, record ID, email or account content.

At verified purge, the transaction creates one minimal proof per registered private receipt, removes the identity-bearing request, receipt association and resolved case history, and discards recovery/status email history. Completion delivery is separate operational processing: its encrypted recipient and delivery-provider metadata are unlinked from the account and expire within seven days. It is not terminal proof.

Status is unavailable immediately at proof expiry. The daily cleanup job physically removes expired proof and expired unlinked completion outbox records, in batches of at most 10,000 proofs. Normal physical cleanup is within the next daily run. Backlog, execution failure and stale execution are monitored; over 26 hours without successful cleanup raises an operational alert. Aggregate retention-run counts contain no customer identifiers.

Daily source schedule: 03:17 UTC. Installation is disabled by default. Staging may temporarily use a minute schedule solely to observe certification, then returns to the daily cadence. Production installation and activation are not authorized by Staging testing.

A device with a receipt already bound to its local account may clear that namespace only after verified terminal proof. Pending web receipts can be imported only after their account fingerprint matches the local namespace; the fingerprint is removed from server records at purge. Late imports and expired/unknown proof cannot authorize automatic erasure. Purge/verification timestamps must be ordered, cannot be materially in the future, and must have the exact approved expiry. The device provides an explicit `DELETE LOCAL DATA` confirmation and checks the same local account namespace before resetting, after waiting for sync/sign-out, and inside the store's reset queue after persistence flush. A changed namespace is preserved. This action never certifies server erasure.

Specific legal holds, provider retention and backups require separate documented governance. This implementation does not invent a legal-retention exception or treat failed work as terminal.
