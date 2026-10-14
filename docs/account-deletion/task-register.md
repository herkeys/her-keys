# Requirement and evidence register

Task PASS means the complete exit evidence exists; implementation alone does not pass a task.

| Task | Appendix requirements | Dependencies | Implementation and acceptance evidence | State |
| --- | --- | --- | --- | --- |
| T00 | Assignment, isolation, platform instructions | None | execution-state.json; isolated branches; Expo 57 docs read | PASS |
| T01 | Schema, storage, providers, immutable ledgers, sharing | T00 | staging-schema-census.json; resource-registry.md; Production census still gated | IN_PROGRESS |
| T02 | State machine, contracts, deadline, failure semantics | T01 | architecture.md; approved shared-household-policy.md; audit retention unresolved | IN_PROGRESS |
| T03 | Request, reauthentication, deactivation, stale JWT/RLS/RPC, outbox | T02 | database.test.mjs; service-only command and restrictive policies; hosted evidence pending | IN_PROGRESS |
| T04 | Restoration, lost email, rotation, status, enumeration/rate limits | T03 | database.test.mjs; deletionService.ts; web restore; full hosted concurrency matrix pending | IN_PROGRESS |
| T05 | Worker, resources, leases, fencing, retry, terminal proof, dry-run | T01–T04 | SQL tests and mutation controls; deletionWorker.ts; scheduler blueprint; hosted certification pending | IN_PROGRESS |
| T06 | Apple nonce/capture/revoke, Google revoke, RevenueCat, subscriptions, branded email | T03–T05 | nonce tests; server-only adapters and encrypted outbox; real provider credentials/certification blocked | BLOCKED |
| T07 | Mobile entry/confirm/pending, startup/resume/offline, namespace cleanup | T03–T04 | DeletionGate and runtime; deviceAndCrypto tests; native/reinstall/remote-receipt checks remain | IN_PROGRESS |
| T08 | Web ownership, confirmation, pending/status, explicit restore/resend | T03–T04 | website components; production build/lint/typecheck; live browser journey pending | IN_PROGRESS |
| T09 | Security, negative controls, mutation, isolation, complete source gates | T03–T08 | full application 4066/4066; website build/lint/typecheck; exact-SHA CI and missing runtime tests pending | IN_PROGRESS |
| T10 | Verified Staging target, disposable scope, safe exact deployment | T09 | verified project and zero household baseline; only marked disposable fixtures permitted; deployment manifest pending | IN_PROGRESS |
| T11 | Real schedule, alerts, delivery, kill switch, cleanup/isolation | T10 | automation-certification.md; no recurring runtime PASS yet | TODO |
| T12 | Production manifest, rollback, concrete owner approval package | T09–T11 | production-handoff.md; gate remains closed | IN_PROGRESS |
| T13 | Approved Production deployment and disposable certification | Explicit approval | No Production mutations authorized or performed | BLOCKED |
| T14 | Separate destructive Production activation approval | T13 and explicit approval | No Production scheduler activation authorized or performed | BLOCKED |

The appendix's security, request/restoration/worker, isolation and platform test lists map to T03–T11. Each unexecuted native/provider/scheduler check remains a release failure until evidenced; a local mock never substitutes for live certification. See certification-results.txt for the separate certification levels.
