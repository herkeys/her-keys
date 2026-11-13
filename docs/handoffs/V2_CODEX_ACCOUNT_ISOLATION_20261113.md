# Her Keys V2 deployed account-isolation evidence

Baseline ee32e9295d8c26e77ca65e45159fd10625e3b517, merge-head CI 43476673388 PASS. PR #49's source regression is 5,604 passed / 0 failed / 0 skipped. This extends the source isolation regressions with actual Staging database checks; it does not certify every account, native session or offline scenario.

## Staging result

PASS: 16 checks against the deployed PostgreSQL policies using the two pre-existing, marked synthetic accounts. Positive checks establish that a valid owner can read their profile, insert/read/update their own private task, and a second member can read a shared task and insert/read their own private task. Negative checks establish that an unrelated account cannot read the other's profile/tasks, update the other's private task or insert into their household. A temporary same-household membership then proves that the member cannot see the owner's private task and the household owner cannot see the member's private task. Owner reassignment is refused. Switching the actor back restores only their own permitted view. Missing identity returns no fixture rows and anon is refused at the privilege layer.

[Executable rollback-only probe](../../supabase/blueprints/codex-v2-staging-isolation-20261113.sql) and [redacted result](evidence/V2_STAGING_ISOLATION_20261113.json).

The probe validates exact synthetic UUID/marker pairs, distinct existing owner households, shared active categories and an unused fixture prefix before any mutation. Existing triggers were inspected first; only the known ID/updated-at/subject/change-log triggers were present. No schema, RLS, grant, function deployment, entitlement, commercial or fixture-permission flag was changed. The temporary membership and all task data changes were inside one transaction. Independent post-rollback query confirmed zero retained probe tasks and zero retained probe memberships.

Two preparation failures were retained rather than called authorization passes: omitted mandatory producer (23502), then incorrect producer enum (23514). The deployed schema/constraint was inspected and the fixture corrected to the shipping producer value user-action. No application constraint or policy was weakened. Only insufficient_privilege is accepted by the explicit permission-refusal cases; unexpected exceptions yield FAIL with safe schema diagnostics. The valid run then reached all 16 assertions and rolled back.

## Boundaries of this evidence

The Management API sets transaction-local roles/claims for a database policy test. This is not an actual signed-in browser/device session, proof that a client cannot forge a JWT, or proof of client cache cleanup. Existing source tests exercise reset/rebind, A-to-B-to-A, pending callbacks, Premium identity and offline fences; live HTTP/native account-switch and offline recovery journeys still require separate evidence. The probe touches only selected synthetic rows in profiles, tasks and membership-related policy paths. It does not certify all application tables or all security-definer RPCs.

Production database isolation probe: NOT_RUN. Production password recovery and session evidence in the recovery report does not imply a household isolation test. Do not run this Staging-only SQL in Production. Both environments retain checkout/test checkout/fixtures OFF and deletion disabled/dry-run; these probes did not need synthetic Premium entitlements.

Next independent checks include household bootstrap/claim/adoption, sync conflicts, durable capture approval, stale-request/quota lifecycle, consent changes during pending provider work, complete free/Premium user journeys and the remaining table/RPC ownership matrix. No cross-account defect was demonstrated by the valid deployed probe, and no blanket account-isolation closeout is issued.
