# Staging certification evidence

Project identity: fhhudicklmpofuzkxeqe. Production npykvnxnehlsdlbumzwk was read-only. Times below are UTC on 2026-10-14. The source revisions, applied migration-name/version mapping, checksums and deployed bundle hashes are in deployment-manifest.json. Deployment was incremental; it is not represented as one atomic deployed Git revision.

## Observed workflows

- Disposable request: exact 30-day deadline, Auth ban, auth.sessions removed, stale JWT RLS returned zero rows and privileged bootstrap refused. A discovered ban-before-signout issue was corrected and verified against hosted Auth.
- Recovery email and explicit browser confirmation restored the account. Merely opening the page did not restore it. The consumed link could not restore it again. Recovery and restoration messages were delivered.
- A separately expired disposable request exercised dry-run, independent private cleanup during provider failure, kill-switch refusal and expired-lease recovery. Only marked synthetic requests had their dates accelerated.
- Real RevenueCat disposable customers were created with the exact Supabase UUID. Deactivation and restoration retained them. Another fixture's asynchronous deletion remained nonterminal at 02:05; the 02:10 scheduler run verified absence and completed. The restored identity remained present. See revenuecat-certification.md.
- Daily proof cleanup was observed physically deleting an expired synthetic record after injected failure, an actually delivered alert and permission recovery. A later daily 03:17 invocation succeeded. See automation-certification.md.

## Multiple-adult and actual storage fixture

Before expiry the fixture had two adults, two exclusively owned private goals, a legitimate shared household category and an uploaded private blob whose Storage owner matched the departing account. RevenueCat remained present and stale account access was refused.

The actual 11:10 scheduled run 4d57ce24-1c44-40de-bb0b-a6569d7362db removed the departing adult's private goal, revoked/removed applicable providers and removed the blob through the Storage API. A subsequent independent Storage list returned zero objects; download reported Object not found. The other adult's private goal, profile, membership and legitimate shared record remained.

The request became failed_requires_action with shared_resources_pending_review, two exact restricted profile/membership cases, and a seven-day target. Auth remained banned. No terminal proof was issued. Requeue with unresolved cases was refused.

For this disposable fixture only, manual reconciliation removed the departing profile and membership, resolved both cases only after their original resources were absent, and requeued the request. Assertions preserved the other adult's role as member, private goal and shared category; no ownership was transferred.

Actual 11:15 run 05448b34-5f79-4e4a-963c-549fb4dda5b8 completed. Auth/profile/request associations were absent; the proof recorded 42 verified resource groups and zero remaining owned records/blobs/Auth identities. Verified time: 11:15:03.819355; expiry: 2027-10-14 11:15:03.819355. Completion email delivery was confirmed by 11:17. The other adult's private goal, member role and shared category still existed.

## Final controls and limitations

Staging destructive worker enabled=false, dry_run=true, batch=1; its cron job is inactive. Monitor remains active every five minutes; proof cleanup remains active daily at 03:17 UTC. The temporary fixture upload policy was removed. The deployed fixture harness is retired v9, requires JWT and returns an inert 410 response with no credentials or privileged operations. The synthetic failed-email alert row was removed after certification. Health reports no failures, stale leases, overdue cases, email problems or retention issues.

Retained Staging identities are the disposable restored fixtures and the preserved second adult. Their data and RevenueCat identity intentionally supplied isolation evidence. The original pre-test Staging account was untouched. One empty certification bucket remains; no blob remains in it. No real customer account was used.

All 43 registered resources are populated by local SQL tests for single-adult, shared-household and former-member ownership scenarios. The unrelated household and other adult remain byte-identical. Hosted all-resource coverage is still distinct from that local evidence. A later additive guard also prevents household destruction when another adult's private ownership survives membership removal; a rolled-back Staging probe verified the guard and left no probe row. Destructive controls remained off.

This is scoped workflow evidence, not a full release PASS. Live Apple/Google revocation, native device flows, the full hosted resource/race/abuse matrix, independent watchdog and public support channel remain incomplete. Production customer deletion and activation were not run.

Concurrent ownership insertion was separately tested through simultaneous PostgREST API transactions: a four-second classification lock forced the other-owner insert to wait 3381 ms. The fixture row was then removed; the temporary service-only RPC was dropped and its Edge endpoint retired with JWT required and an inert 410 response. The direct connector had serialized SQL calls, so those earlier calls are not reported as concurrency evidence. Staging destructive controls remained disabled throughout.
