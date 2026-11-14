# Account deletion sprint checkpoint — 2026-11-13 (ET)

**Source repairs are ready for review. Hosted certification and Production activation are blocked.** No Production mutation, merge, EAS build, or store upload was performed.

| Gate | Result | Evidence or reason |
|---|---|---|
| G0 Infrastructure | FAIL (incomplete) | Guard structure verified in both projects; local service-role regression passed. Secret-name check returned 403, current dedicated fixture RPC is absent, and mailbox control was not established. No hosted mutation probe. |
| G1 Source engineering | PASS (local candidate) | Mobile candidate `a73d3b96989b4a79f0a196caf75e30962d6ecb8a`: 5,682/5,682 full tests, 131 focused deletion and migration checks, mobile/Edge/harness type checks. Release sign-off still requires hosted evidence and review of retained unresolved provider material. |
| G2 Hosted Staging lifecycle | NOT RUN | No owned fixtures created; safe controls read back. |
| G3 Website source | PASS (local candidate) | Website candidate `b83faa09d981da73874b8373c0297a52f46e40fc`: five tests, typecheck, lint, production build, dependency audit and local HTTP/privacy-header smoke. |
| G4 Public website | FAIL | /delete-account is a disabled placeholder (200); /account/restore is missing (404). |
| G5 Production deployment readiness | FAIL | Hosted validation, email, provider sign-off, exact rollback rehearsal and operational gates are open. |
| G6 Production worker activation | BLOCKED | Worker, monitor and retention cron all inactive; explicit owner activation is a separate gate. |
| G7 Apple compliance | PARTIAL | In-app flow exists, but hosted erasure, recovery/email and provider results have not been recertified. |
| G8 Google Play compliance | FAIL | Live external deletion request is unavailable; Play Console declarations and Android native lifecycle remain unverified. |
| G9 Integrated iOS/Android EAS readiness | FAIL | Candidate iOS/Android exports passed locally. No merged deletion candidate; hosted certification, exact merged exports and Production preflight remain open. |

Drafts: [mobile/backend PR #59](https://github.com/herkeys/her-keys/pull/59), [website PR #11](https://github.com/herkeys/her-keys-web/pull/11). Prior website [PR #9](https://github.com/herkeys/her-keys-web/pull/9) remains open; do not merge both. Changes on the two sprint branches are separate from live integration/main.

Both draft checks passed: [mobile integration CI](https://github.com/herkeys/her-keys/actions/runs/43546119731) and [website CI](https://github.com/herkeys/her-keys-web/actions/runs/43546121411).

- [Source and deployment baseline](baseline.md) and [sanitized deployment inventory](baseline-deployment-evidence.json)
- [Lifecycle, cleanup, and provider verification](lifecycle-and-provider.md)
- [Hosted fixture and test matrix](staging-and-tests.md)
- [Website, email, and monitoring](website-and-operations.md)
- [Policy decisions and release handoff](promotion-and-policy.md)
- [Repair ledger](defects.md)

Next action: have the Her Keys project owner confirm the required Staging configuration by name and confirm control of the approved test inbox. Then run the scoped lifecycle against the reviewed candidate before changing either public site or Production database.
