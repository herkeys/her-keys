# Requirement and evidence register

PASS requires the task's complete exit evidence. A scoped test PASS does not imply release acceptance.

| Task | Requirements | Evidence and remaining exit work | State |
| --- | --- | --- | --- |
| T00 | Assignment, isolation, platform instructions | Recorded ENTRY SHAs; separate codex branches; Expo 57 docs read; auditor/main checkouts untouched | PASS |
| T01 | Schema, storage, providers, immutable ledgers, sharing | Staging/Production schema census; 43-resource registry plus explicit household/profile/discovery-answer paths; private Storage ownership and provider identity census | PASS |
| T02 | States, contracts, deadlines, retention and shared ownership | architecture.md; approved conservative policy; approved five-field/365-day retention; explicit partial/review states and seven-day target | PASS |
| T03 | Request, recent auth, deactivation, stale JWT/RLS/RPC, outbox | Real SQL and hosted Auth ban/session reconciliation, stale RLS/bootstrap refusal; complete hosted hostile-service matrix remains | IN_PROGRESS |
| T04 | Recovery, resend, rotation, status, abuse and concurrency | Single-use/deadline/replacement SQL; delivered links and browser restoration/replay refusal; full hosted race/abuse matrix remains | IN_PROGRESS |
| T05 | Cleanup, leases/fences, retries, verification, dry-run | All 43 registered resources populated in local SQL for single/shared/former-member scenarios; other-account byte preservation; actual scheduled Staging storage/provider/shared/manual cleanup; full hosted resource/failure matrix remains | IN_PROGRESS |
| T06 | Apple/Google/RevenueCat, subscriptions and transactional email | RevenueCat disposable E2E PASS; real email delivery; Apple nonce preserved; live Apple/Google revocation SKIPPED by owner decision; coverage remains unverified | IN_PROGRESS |
| T07 | Mobile entry, restriction, startup/resume/offline and local cleanup | Source/device logic and account-switch reset race tests pass; native runtime, reinstall and offline UI evidence unavailable | BLOCKED |
| T08 | Accessible web deletion, ownership, pending, restore/resend | Website build/lint/types and exact-revision CI pass; pending/restored browser screenshots; owner-approved public support configured in source; complete hosted abuse matrix remains | IN_PROGRESS |
| T09 | Integration, security, negative/mutation/isolation checks | Full local suite and exact-source CI; resource coverage and reset races; native/provider/hosted matrix/advisor limitations prevent acceptance | IN_PROGRESS |
| T10 | Exact Staging target, isolated fixtures and deployment | deployment-manifest.json captures migration mapping/checksums and runtime bundle hashes; scoped Staging evidence exists; complete dependency acceptance remains | IN_PROGRESS |
| T11 | Scheduler, monitoring, kill switch, complete verification | Actual scheduler run IDs, delivered alerts, failure/recovery, daily physical proof deletion, live shared/manual/Storage E2E; independent watchdog/full matrix remain | IN_PROGRESS |
| T12 | Concrete Production manifest and rollback package | production-handoff.md and deployment-manifest.json; candidate is reviewable, approval gate stays closed until missing checks pass | IN_PROGRESS |
| T13 | Owner-approved Production deployment and disposable certification | Eight reviewed SQL migrations authorized/applied; remaining Edge deployment, named disposable certification and customer deletion are not authorized | IN_PROGRESS |
| T14 | Separately approved destructive Production activation | No Production scheduler installed or activated | BLOCKED |

All appendix functional/security/platform requirements map to T03–T11. Native/provider gaps remain unexecuted release requirements; they cannot be passed by mocks. Production authority is not inferred from source or Staging results. See certification-results.txt and the linked evidence reports.
