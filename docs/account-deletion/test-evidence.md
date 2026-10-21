# 2026-10-19 source repair evidence

Current source checkpoint: `6267a299206a4e9e48ca987891e7c971567c1223`. The complete local suite passed **5,233/5,233**, zero failures/skips/cancellations: `evidence/full-suite-at-6267a299.txt`. The original eight SQL failures are repaired without bypassing classification, ownership, provider or terminal evidence assertions. Current resource coverage populates all 50 registered tables. Deno checks, TypeScript, Expo compatibility and Doctor (21/21) passed. The separate web exact SHA `c751f9e7eb18575ecc86e2bd4ad862349d648324` passed [CI](https://github.com/herkeys/her-keys-web/actions/runs/39278472014).

Mobile exact source CI is [run 39279605347](https://github.com/herkeys/her-keys/actions/runs/39279605347); it was queued during document preparation. A final documentation commit has its own exact-head gate. Only a completed successful run may be reported as PASS. Historical test totals below are not the current candidate total.

Fresh hosted evidence and limits are in `staging-certification.md`, `evidence/function-parity-final.json`, `cross-platform-test-matrix.md` and the closeout report. Docker SQL/PostgREST and native OS journeys were attempted but unavailable; these are not conflated with embedded PostgreSQL/source tests. Production was read-only and destructive processing remains OFF.

## Historical review/evidence (2026-10-14)

# Test evidence

Historical runtime: Node v24.14.0 and Expo SDK 57. Current integration CI uses Node 22; the local 2026-10-19 suite used Node 24. PGlite 0.5.9 runs PostgreSQL 18.6; hosted Staging is PostgreSQL 17.6. Local SQL tests are not substituted for hosted evidence.

Latest full application suite: 4077 PASS, 0 FAIL (full-tests.log), including retention expiry, prior-restored-history removal, restricted shared cases, provider retry and negative/mutation controls. Mobile TypeScript and release identity checks pass. Deno checks pass for the changed worker, retention endpoint and temporary fixture harness. Website production build, TypeScript and ESLint pass. Expo dependency check and Doctor 21/21 previously passed without dependency changes.

The first integration run had pre-existing boundary provenance overclaims; they were assigned to their actual legal/email integration lane. During continuation, another local sibling advanced from the assignment ENTRY ad72ccd. The scanner now recognizes exactly that shared ENTRY without allowing any later sibling commit. Its boundary suite passes. The full suite then passed 4077/4077. No sibling Premium source was merged.

Live Staging evidence is recorded separately in staging-certification.md, automation-certification.md and revenuecat-certification.md. Real request restriction, delivered recovery, explicit browser restoration/replay refusal, scheduler processing, provider async completion, Storage API blob removal, shared preservation, failure alerts and daily proof cleanup have been observed.

Native runtime remains unverified. Automatic approval review rejected the local Expo dev-server launch command as blocked by policy; it was not retried or bypassed. No iOS build/runtime evidence is available from this Windows environment. Hosted all-resource fixtures, native offline/reinstall/account-switch flows and the complete hosted adversarial matrix remain incomplete. The owner deferred live Apple/Google revocation tests; their result is SKIPPED_OWNER_DECISION, not PASS. A mock is not a substitute.

resourceCoverage.test.mjs seeds all 43 registered resources with constraints and immutable-ledger triggers enabled, using governed RLS-authored household population plus explicit provider/consent/automation fixtures. Single-adult cleanup erases every registered owned row; shared and former-member scenarios preserve another adult and an unrelated household byte-for-byte. Discovery answers and child records are included. Provider revocation remains a separate live test, not simulated by database row removal.

The local reset tests cover an account switch before queued reset starts and while persistence flush is blocked. Both preserve replacement-account state. Terminal timestamps must be ordered, within clock tolerance, and expire exactly 365 days after verification.

Concurrent ownership insertion was separately tested through simultaneous PostgREST API transactions: a four-second classification lock forced the other-owner insert to wait 3381 ms. The fixture row was then removed; the temporary service-only RPC was dropped and its Edge endpoint retired with JWT required and an inert 410 response. The direct connector had serialized SQL calls, so those earlier calls are not reported as concurrency evidence. Staging destructive controls remained disabled throughout.
