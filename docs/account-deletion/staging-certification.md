# Staging certification evidence

## 2026-10-19 repair certification (current)

This section supersedes the source/deployment status of the dated 2026-10-14 evidence below; it does not relabel that historical native/provider/storage/email evidence. Source checkpoint: `6267a299206a4e9e48ca987891e7c971567c1223`. Target was verified as Her Keys Staging `fhhudicklmpofuzkxeqe` before each destructive fixture. Production `npykvnxnehlsdlbumzwk` was read-only throughout.

All four additive repair migrations passed the fresh canonical embedded-PostgreSQL chain. Applied Staging identifiers and exact LF source SHA-256 checksums are in `production-promotion-manifest-20261019.json` and `evidence/repair-migration-checksums.json`:

| Canonical source version / name | Staging history version |
|---|---|
| 20261019144729_account_deletion_v2_resource_certification | 20261019150824 |
| 20261019151501_account_deletion_optional_welcome_inventory | 20261019151616 |
| 20261019152629_account_deletion_overdue_request_monitor | 20261019152912 |
| 20261019153801_account_deletion_private_household_owners | 20261019153856 |

Fresh catalogs identified 11 previously unclassified public Premium tables and private AI reporting. Source now registers 50 account resources, plus exact reviewed global/lifecycle/custom classifications. The Production-only welcome receipt ledger is absent on Staging by design; its absence was explicitly classified after the first independent terminal check blocked correctly. Required-table absence still fails.

Destructive testing was scoped to newly created UUIDs with server-owned `deletion_certification_fixture=true` and a unique run marker, synthetic tagged inbox aliases, normal Auth verification/bootstrap and known FK relationships. The normal worker scheduler stayed inactive. A temporary helper required the exact Staging project and owned markers before seeding/accelerating anything. `test_scope_only=true` and an expiring UUID allowlist bounded worker claims and every fenced action. Auth reconciliation was filtered to that scope; email draining was suppressed so no unrelated outbox was consumed. Original deadlines for unrelated accounts were never changed.

Observed runs (UTC):

- **Recovery and first terminal attempt, HTTP 1769 / run a97eaba5…:** freshly verified request, exact 30-day deadline, access ban/session revocation, replacement token rejection, successful restoration and single-use replay refusal. A new lifecycle then became eligible using only its owned synthetic date override. Cleanup removed the seven Premium leaves, goal/bootstrap records, owned AI report and mixed identity references while preserving the second fixture's registry digest. Terminal verification refused the absent welcome ledger rather than reporting completion.
- **Corrected independent retry, HTTP 1770:** the same scoped fixture resumed after the additive optional-ledger repair. Actual Auth absence, zero owner counts and 52 verified resource groups produced a five-field proof at **15:16:20.971074**, expiring **2027-10-19 15:16:20.971074**. Nonterminal request/account association was gone. The other goal remained. See `evidence/staging-independent-retry.json`.
- **Shared household, HTTP 1772 / run 5ba86d8b…:** private cleanup preserved the other adult's full registry digest and goal/profile. The worker opened exactly two restricted review cases and entered `failed_requires_action`, with no terminal success. Only after disposable profile/member reconciliation and verified case closure did a requeue finish. Public status returned purged at **15:17:14.499449**, with 52 verified groups and the approved expiry. See `evidence/staging-shared.json`.
- **Real RevenueCat deletion, HTTP 1773 / run 19ed489f…:** two exact UUID customers were created (201) and read (200) in `proj93809efe`. The worker erased customer `021c25ea…` and independently verified 404 before proof at **15:19:04.744227**. A separate RevenueCat connector lookup confirmed deleted customer 404 and unrelated customer `3f4eb231…` still 200. The other account's registry digest/profile/goal remained. See `evidence/staging-revenuecat.json` and independent connector evidence.
- **Fixture teardown, HTTP 1775/1776/1777:** each preserved second account went through its own ordinary deletion lifecycle under its owned run marker. An Auth-only sentinel was checked to have no application profile before removal. No retained other adult was erased through someone else's household cascade. All three teardown runs passed, including provider removal for the previously preserved RevenueCat customer. All Auth fixtures owned by these run markers and temporary scopes were absent afterward.
- **Provider acknowledgement crash-slot injection, HTTP 1780:** a scoped synthetic post-Auth retry began with all three individual provider acknowledgements but no aggregate. The current worker repaired the aggregate without replaying provider calls, independently verified absence, erased its request and issued the five-field proof at **15:35:23.962820**. This is a deliberate state-injection regression, not a new claim of live Apple/Google revocation.
- **Former adult/private receipt-only probe:** a separate random synthetic SQL subtransaction proved that a private Premium receipt alone protects a former adult's household ownership. Every probe Auth/profile/household/receipt change was rolled back. Controls stayed off/dry-run. The local negative control also reproduces the old false ownership result.

Final nine Staging bundles and source file graph hashes were read back and compared with the source checkpoint. All match after LF normalization. Versions: request 11, restore 9, resend 9, status 9, process 14, monitor 11, capture Apple 9, begin web 8, expire proof 8. See `evidence/function-parity-final.json`; transport bundle hashes are recorded separately from individual source hashes. Invalid/unauthorized HTTP smoke checks passed for all nine current endpoints.

The temporary certification RPC was dropped. The temporary endpoint was retired at version 3, requires JWT and has only an inert 410 body. No helper, fixture policy, accelerated deadline or allowlist row is included in Production promotion. Staging ended **enabled=false, dry_run=true, test_scope_only=false, zero scoped accounts, zero active destructive scheduler jobs**, zero owned Auth fixtures, no failed/stale/overdue cases or requests. Three historical 2026-10-14 marked Auth users were observed and preserved; this repair did not claim ownership of them. The existing monitoring and daily retention jobs remain unchanged. Minimal test proofs and unlinked completion outboxes follow the approved retention policy; the current scoped run did not claim completion email delivery.

Limits: all 50 resources were populated locally, while the hosted fixture populated the new V2 leaves and selected bootstrap/domain records and independently counted every registered resource. The complete hosted all-resource/race/failure matrix, actual native journeys, vendor log/backup retention and independent external watchdog remain open. Live Apple/Google revocation is owner-deferred. Docker SQL/PostgREST could not run without its daemon. Current native/processor/website results are separated in `cross-platform-test-matrix.md`.

## Historical 2026-10-14 evidence

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

This is scoped workflow evidence, not a full release PASS. Native device flows, the full hosted resource/race/abuse matrix and independent watchdog remain incomplete. The owner has deferred live Apple/Google revocation tests and approved the public support address, now configured in website source. Production customer deletion and activation were not run. The owner subsequently authorized the eight reviewed Production SQL migrations; see production-migration-evidence.json.

Concurrent ownership insertion was separately tested through simultaneous PostgREST API transactions: a four-second classification lock forced the other-owner insert to wait 3381 ms. The fixture row was then removed; the temporary service-only RPC was dropped and its Edge endpoint retired with JWT required and an inert 410 response. The direct connector had serialized SQL calls, so those earlier calls are not reported as concurrency evidence. Staging destructive controls remained disabled throughout.
