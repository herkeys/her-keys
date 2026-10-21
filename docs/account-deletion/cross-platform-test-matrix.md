# Cross-platform deletion evidence — 2026-10-19

`SOURCE_TEST_PASS` means executable domain/SQL or source UI evidence. It never means an OS simulator or physical device passed. All local source tests use the final code checkpoint 6267a299 unless the evidence explicitly states an earlier historical date.

| Scenario | Shared source/backend | Android native | iOS native | Hosted/provider evidence |
|---|---|---|---|---|
| Find Delete Account | Source: Your Account → Privacy & Data → Delete Account | NOT_RUN | NOT_RUN | Public website still placeholder |
| Verified initiation / bad auth / stale JWT | SOURCE_TEST_PASS | NOT_RUN | NOT_RUN | Hosted request and ban/session revocation observed |
| Duplicate / timeout / concurrent request | SOURCE_TEST_PASS | NOT_RUN | NOT_RUN | SQL preserves original deadline; hosted duplicate rejected after session revocation |
| 30-day explanation and original cutoff | SOURCE_TEST_PASS | NOT_RUN | NOT_RUN | Exact 30-day request observed; only owned fixtures accelerated |
| Recovery / replacement / replay | SOURCE_TEST_PASS | NOT_RUN | NOT_RUN | Hosted restoration, replaced-token rejection and single-use replay refusal observed |
| Pending/restricted writes and restart | SOURCE_TEST_PASS | NOT_RUN | NOT_RUN | RLS and durable proof coverage; OS restart not certified |
| A→B / A→B→A races at async boundaries | SOURCE_TEST_PASS | NOT_RUN | NOT_RUN | New runtime/scoped sign-out regressions; no OS storage PASS claimed |
| Wrong, missing, future, expired terminal proof | SOURCE_TEST_PASS | NOT_RUN | NOT_RUN | Hosted independent proof; five-field whitelist and 365-day expiry |
| Valid proof/local reset | SOURCE_TEST_PASS | NOT_RUN | NOT_RUN | Local reset is distinct from cloud completion |
| Shared adults/children/former membership | SOURCE_TEST_PASS | NOT_RUN | NOT_RUN | Hosted two-case escalation and reconciliation; former receipt-only owner probe rolled back |
| All registered resources populated | SOURCE_TEST_PASS, 50/50 | N/A | N/A | Hosted subset populated; all 50 actual owner counts independently checked |
| Apple credential exchange/subject check/revoke failure | SOURCE_TEST_PASS | N/A | NOT_RUN | Live Apple revocation NOT_VERIFIED, owner deferred |
| Google identity / Calendar grant cleanup | SOURCE_TEST_PASS | NOT_RUN | NOT_RUN | Live Google revocation NOT_VERIFIED, owner deferred |
| RevenueCat customer deletion/isolation | SOURCE_TEST_PASS | NOT_RUN | NOT_RUN | LIVE PASS: created 201, pre-read 200, removed customer 404, unrelated customer 200 |
| Subscription cancellation distinction | Source disclosure and official management links | NOT_RUN | NOT_RUN | No cancellation/refund/store transaction deletion performed |
| Storage cleanup | SOURCE_TEST_PASS | N/A | N/A | 2026-10-14 blob evidence historical; current hosted fixture had no blob |
| Completion email acceptance/delivery/failure | SOURCE_TEST_PASS | NOT_RUN | NOT_RUN | Historical delivered email/alert evidence; current scoped runs did not drain mail |
| Public web ownership verification/recovery | Source build + two regressions pass | NOT_RUN | NOT_RUN | BLOCKED: live page placeholder; restore URL 404 |
| Native reminders and SecureStore cleanup | SOURCE_TEST_PASS | NOT_RUN | NOT_RUN | Emulator boot blocked; iOS toolchain absent |
| Kill switch / lease expiry / stale fence / review requeue | SOURCE_TEST_PASS | N/A | N/A | Scoped hosted runs restored OFF/dry-run; unresolved review withheld terminal proof |
| Provider-ack crash and retry | SOURCE_TEST_PASS | N/A | N/A | Hosted HTTP 1780 verified missing-aggregate recovery and terminal proof |
| Monitoring / expired-proof retention | SOURCE_TEST_PASS | N/A | N/A | Current health zero; historical scheduled expiry/alert evidence remains dated |

Android attempts used only the agent-started `HerKeys_Runtime_B` instance on port 5584, with a second cold boot. ADB responded, but the package manager/boot remained unavailable. The agent stopped that instance and its Metro server; no existing user app data was reset. No IPA, APK, AAB, EAS release build or production-signed artifact was generated. Docker SQL/PostgREST testing remains blocked by the unavailable Linux daemon; embedded PostgreSQL applied the complete canonical migration chain successfully.
