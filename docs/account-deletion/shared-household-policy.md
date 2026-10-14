# Approved multi-adult deletion policy

Owner decision recorded in this chat: `MULTI_ADULT_HOUSEHOLD_POLICY=DELETE_ACCOUNT_OWNED_ESCALATE_SHARED`; `AUTOMATIC_OWNERSHIP_TRANSFER=DISABLED`; `DELETE_OTHER_ADULT_DATA=PROHIBITED`; `FALSE_TERMINAL_PURGE=PROHIBITED`.

After the original recovery deadline, delete exclusively owned private rows only when no incoming foreign-key reference remains. Iterate leaves first so cascades cannot erase another adult's rows. Discovery answers inherit their one parent's ownership. Account consents, OAuth state, welcome receipts, credentials and owned blobs are independent cleanup steps. Preserve other adult profiles and legitimate household data.

Shared contributions, blocked references, departing membership and uncertain child ownership create exact-resource cases without payload copies. Restrictive policies hide unresolved personal contributions from ordinary client access; no ownership changes occur. A partial request becomes failed_requires_action and cannot pass terminal verification. Processing can be retried without losing the case.

Operator target: resolve each case within seven days of escalation. This is an operational target, not legal permission to retain data. The monitor alerts on unresolved failures and separately reports overdue cases. Operators must review lawful retention and erase or redact the departing person's contributions wherever permitted, without silently retaining personal information or transferring ownership.

Resolution procedure:

1. Query service-only account_deletion_cases for the request. Record the exact resource, reason, allowed action, responsible operator and approval reference in the operational incident.
2. Review actual relationships and the rights of remaining adults. Obtain explicit authorization for any transfer through a separately approved process. No automatic transfer API exists here.
3. Perform the approved erasure/redaction/reconciliation under a reviewed, scoped operation. Never disable immutable triggers globally or grant a client bypass.
4. Call service-only herkeys_resolve_deletion_case(case_uuid, incident_reference). It refuses closure while the original resource still exists; retained/redacted shared resources require an explicit reviewed reconciliation that removes the departing personal record and its references first.
5. Once all cases are resolved, call herkeys_deletion_command('requeue_reviewed', ...). The worker performs all actual cleanup and terminal checks again. Case closure cannot directly set purged.
6. Communicate the actual status to the customer. Missed targets escalate; they never silently close the case.

Required evidence includes private A erased, private B preserved, household preserved, ambiguous A contributions restricted, no owner-role changes, interrupted cleanup retryability, refused closure of retained rows, manual requeue refusal while unresolved, and terminal refusal on partial work.
