# Phase 4 — Hosted Staging certification, 2026-11-13 ET

**PASS for the scoped Staging lifecycle exercised below.** Live Apple revocation and browser OTP were outside the evidence for this pass. Production promotion and destructive activation remain blocked on their separate gates.

Staging `fhhudicklmpofuzkxeqe` only. Tested code `a73d3b96989b4a79f0a196caf75e30962d6ecb8a`, mobile PR #59 head `c20680f1a9a191cc3d51064bdc4df8981115dc36`. The reviewed recovery migration applied as Staging history `20261114025604`. Read-back matched all files and gateway JWT settings for all seven candidate bundles:

| Function | Version | JWT |
|---|---:|---|
| request-account-deletion | 13 | true |
| deletion-status | 11 | false |
| restore-account | 11 | false |
| resend-restoration-email | 11 | false |
| begin-web-deletion | 10 | false |
| process-account-deletions | 16 | false |
| monitor-account-deletions | 13 | false |

The HMAC-authenticated runtime probes (pg_net IDs 9146 and 9147, HTTP 200) verified the Staging host, an encryption round trip, email enablement, Resend key, alert and recovery configuration, the approved Gmail recipient, the exact Her Keys RevenueCat project/key, Google Calendar credentials and Auth client configuration without returning secret values. The four Apple deletion credential names were absent; live Apple revocation was not run. The Supabase CLI still returned HTTP 403 for secret listing. Gmail access was independently confirmed in the authorized browser profile.

| Scenario | Hosted result | Evidence |
|---|---|---|
| Request and deactivation (A) | PASS | HTTP 200 / pending (pg_net 9150); server recorded 30-day deadline; the previously issued JWT could read zero profile rows; Auth ban present; no pending Auth reconciliation. |
| Recovery mail (A) | PASS | Non-destructive monitor 9151 returned HTTP 200 while purge was disabled. Outbox advanced from queued to Resend accepted. Saw the new recovery message at 9:58 PM in the approved Gmail inbox. |
| Restore and replay (A) | PASS | 9152 returned HTTP 200 / restored; replay HTTP 400 / invalid_or_expired. A fresh login and the same profile succeeded. The fixture's proof was used in memory by the test harness; no Production recovery link was opened. |
| Deadline boundary (B) | PASS | Exact expiring allowlist, purge cron remained disabled. Before updating the fixture's deadline, claim count was 0. After backdating only B, claim count was 1, fence 1. Original deadline 2026-12-14 02:59:45.717534 UTC; test deadline 2026-11-14 02:59:11.746517 UTC. |
| Interruption / kill switch (B) | PASS (injected) | Stopped after the database claim, switched to disabled/dry run, verified refusal of fence 1, then expired only B's lease. Next attempt reclaimed under fence 2. This simulates process loss; it did not kill an Edge runtime. |
| Provider retry (B) | PASS (injected failure; real retry) | 9156 worker run `1babbc89-5045-4bd4-9e17-11fc48a60922` injected the failure for B's RevenueCat attempt 2, recorded requires_retry with no terminal proof and kept B's Auth identity. The normal worker on retry performed verification. An independent RevenueCat lookup of B returned 404; no pre-existing RevenueCat customer was created for this run, so this demonstrates confirmed absence, not erasure of an existing subscriber. |
| Shared household (B and C) | PASS | Worker opened two unresolved review cases and preserved C's Auth account and owned goal. The approved fixture-only review closed those cases and requeued B. C's goal and Auth were independently still present after B reached terminal proof, before C's own cleanup. |
| Terminal verification (B) | PASS | Normal worker 9157, run `7f93287f-df1b-4981-9c5b-ad6dd812ad5c`, verified 52 resource groups and zero remaining owned records, blobs and Auth identities at 2026-11-14 03:01:00.615559 UTC. Independent SQL confirmed no B Auth, Storage or request row. |
| Final cleanup and completion mail (A, B, C) | PASS | A and C were purged in their own scoped runs (9161/9162). Independent read-back: zero Auth, profile and Storage rows for all three; three minimal terminal proofs retained by policy. Monitor 9164 returned 200 and Resend accepted all three completion messages. Gmail showed the thread with three new messages at 10:07 PM. Outbox provider delivery polling was still unconfirmed when sampled; Gmail arrival is separate evidence. |
| Baseline preservation and reset | PASS | Exactly two original requests before and after; SHA-256 over both complete ordered rows remained `78b8494b72f62bdf27ebb4c73677fe2c662b2c3842fb62e3c46b96895c44b932`. Three unrelated legacy-marked Auth users also remained. Zero scope rows; enabled=false, dry_run=true, test_scope_only=false, purge cron inactive. The temporary Edge harness was retired to the original HTTP 410 stub (version 8, gateway JWT enabled). No fixture SQL RPC was installed. |

Fixtures A (recovery), B (shared/worker), and C (survivor sentinel) were newly created with the same unique certification run marker and isolated aliases under the controlled inbox. No account IDs, recovery tokens, private receipts, provider message IDs, or message bodies are needed to reproduce the conclusions in this report.

Not run in this pass: public website end to end against Staging including browser OTP, hosted replacement failure/bounce/rotation scenarios, live Apple or Google revocation, deletion of a previously existing RevenueCat subscriber, populated Storage erasure, and native device verification. These are not implied by the scoped PASS. No Production deployment, merges, or EAS builds.
